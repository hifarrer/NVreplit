import fs from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { fileURLToPath } from "url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, ensureBrowser } from "@remotion/renderer";
import { normalizeSubtitleStyle, isTikTokSubtitleStyle, parseAssToCaptions, createTikTokPages } from "./captions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedServeUrl: string | null = null;
let browserReady = false;

const isRender = !!(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID);
const isRailway = !!(process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_ENVIRONMENT_ID);
const isReplit = !!(process.env.REPL_ID || process.env.REPL_SLUG || process.env.REPLIT_DEV_DOMAIN);
const isCloudHost = isRender || isRailway;

const getHostEnvName = (): string => {
  if (isRender) return "Render";
  if (isRailway) return "Railway";
  if (isReplit) return "Replit";
  return "local";
};

const getRenderConfig = () => {
  const cpuCount = os.cpus().length;

  if (isCloudHost) {
    const cloudConcurrency = Math.max(1, Math.min(cpuCount, 4));
    return {
      concurrency: cloudConcurrency,
      timeoutInMilliseconds: 15 * 60 * 1000,
      chromiumOptions: {
        disableWebSecurity: true,
        gl: "swangle" as const,
        headless: true,
      },
      offthreadVideoCacheSizeInBytes: 256 * 1024 * 1024,
      jpegQuality: 65,
      disallowParallelEncoding: false,
      scale: 0.667,
      logLevel: "warn" as const,
    };
  }
  if (isReplit) {
    return {
      concurrency: 1,
      timeoutInMilliseconds: 60000,
      chromiumOptions: {},
      offthreadVideoCacheSizeInBytes: null,
      jpegQuality: 80,
      disallowParallelEncoding: false,
      scale: 1,
      logLevel: "warn" as const,
    };
  }
  return {
    concurrency: null,
    timeoutInMilliseconds: 30000,
    chromiumOptions: {},
    offthreadVideoCacheSizeInBytes: null,
    jpegQuality: 80,
    disallowParallelEncoding: false,
    scale: 1,
    logLevel: "warn" as const,
  };
};

// Set up library path for Chrome headless shell dependencies
// This helps find libnspr4.so and other required libraries on Linux systems
// Note: If using Nix (shell.nix), the LD_LIBRARY_PATH should be set by the shell environment
const setupLibraryPath = () => {
  if (process.platform === "linux") {
    const currentLdPath = process.env.LD_LIBRARY_PATH || "";
    const commonLibPaths = [
      "/usr/lib",
      "/usr/lib/x86_64-linux-gnu",
      "/lib/x86_64-linux-gnu",
      "/lib64",
    ];
    
    const libPaths = commonLibPaths.filter(Boolean).join(":");
    
    // Only append if not already in the path and if shell.nix hasn't set it
    if (currentLdPath && !currentLdPath.includes("/nix/store")) {
      // If shell.nix set it, don't override; otherwise add common paths
      if (!currentLdPath.includes(libPaths)) {
        process.env.LD_LIBRARY_PATH = `${currentLdPath}:${libPaths}`;
      }
    } else if (!currentLdPath) {
      // No LD_LIBRARY_PATH set, use common paths as fallback
      process.env.LD_LIBRARY_PATH = libPaths;
    }
  }
};

// Initialize library path on module load
setupLibraryPath();

/**
 * Pre-download Chrome Headless Shell and bundle the Remotion entry point
 * at server startup so the first render request doesn't pay these costs.
 * Call this once from your server bootstrap code.
 */
export const warmUpRemotionRenderer = async () => {
  const start = Date.now();
  console.log(`[REMOTION] Warming up renderer (env: ${getHostEnvName()})...`);

  try {
    await ensureBrowser({
      logLevel: "info",
    });
    browserReady = true;
    console.log(`[REMOTION] Browser ready in ${Date.now() - start}ms`);
  } catch (err) {
    console.error("[REMOTION] Failed to ensure browser:", err);
  }

  try {
    const bundleStart = Date.now();
    await getServeUrl();
    console.log(`[REMOTION] Bundle cached in ${Date.now() - bundleStart}ms`);
  } catch (err) {
    console.error("[REMOTION] Failed to pre-bundle:", err);
  }

  console.log(`[REMOTION] Warm-up complete in ${Date.now() - start}ms`);
};

/**
 * Download a remote video to a local temp file so Remotion can read frames
 * from disk instead of making an HTTP request per frame through its proxy.
 */
const downloadVideoToLocal = async (url: string): Promise<string> => {
  const tmpPath = path.join(
    os.tmpdir(),
    `remotion-src-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
  );
  const start = Date.now();
  console.log(`[REMOTION] Downloading source video to local disk...`);

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download video: ${res.status} ${res.statusText}`);
  }

  const fileStream = fs.createWriteStream(tmpPath);
  await pipeline(Readable.fromWeb(res.body as any), fileStream);

  const stat = fs.statSync(tmpPath);
  console.log(`[REMOTION] Source video downloaded in ${Date.now() - start}ms (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  return tmpPath;
};

const getCaptionResolution = (
  aspectRatio: string | undefined,
): { width: number; height: number } => {
  if (aspectRatio === "16:9") {
    return { width: 1920, height: 1080 };
  }
  // Vertical default used across this app.
  return { width: 1080, height: 1440 };
};

const getServeUrl = async (): Promise<string> => {
  if (cachedServeUrl) {
    return cachedServeUrl;
  }

  // Use absolute path based on project root
  // This works in both dev (where __dirname is server/services)
  // and production (where __dirname might be dist/services or bundled differently)
  const projectRoot = process.cwd();
  
  // Try multiple possible locations for the Remotion Root.tsx file
  const possiblePaths = [
    path.resolve(projectRoot, "server/remotion/Root.tsx"), // Production: project root
    path.resolve(__dirname, "../remotion/Root.tsx"), // Dev: relative to current file
    path.resolve(projectRoot, "dist/remotion/Root.tsx"), // Production: if copied to dist
    path.resolve(__dirname, "../../server/remotion/Root.tsx"), // Alternative relative path
  ];
  
  let finalEntryPoint: string | null = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      finalEntryPoint = possiblePath;
      break;
    }
  }
  
  if (!finalEntryPoint) {
    throw new Error(
      `Remotion entry point not found. Tried:\n` +
      possiblePaths.map(p => `  - ${p}`).join("\n") +
      `\nCurrent working directory: ${projectRoot}\n` +
      `__dirname: ${__dirname}`
    );
  }
  
  // Verify node_modules exists (helpful for debugging)
  const nodeModulesPath = path.resolve(projectRoot, "node_modules");
  if (!fs.existsSync(nodeModulesPath)) {
    console.warn(`[REMOTION] Warning: node_modules not found at ${nodeModulesPath}`);
  }
  
  // Change to project root directory before bundling
  // This ensures webpack can resolve node_modules from the project root
  // Webpack looks for node_modules relative to the current working directory
  const originalCwd = process.cwd();
  let changedDir = false;
  
  try {
    if (originalCwd !== projectRoot) {
      process.chdir(projectRoot);
      changedDir = true;
      console.log(`[REMOTION] Changed working directory to ${projectRoot} for bundling`);
    }
    
    // Use relative path from project root for entry point to help webpack resolve modules
    const relativeEntryPoint = path.relative(projectRoot, finalEntryPoint);
    const entryPointToUse = changedDir ? relativeEntryPoint : finalEntryPoint;
    
    // Bundle without webpackOverride to avoid breaking Remotion's internal webpack setup
    // By changing to project root, webpack should be able to find node_modules naturally
    cachedServeUrl = await bundle(entryPointToUse);
  } finally {
    // Restore original working directory
    if (changedDir) {
      process.chdir(originalCwd);
    }
  }
  return cachedServeUrl;
};

export const renderVideoWithTikTokCaptions = async ({
  videoSrc,
  assContent,
  subtitleStyle,
  aspectRatio,
  audioDurationSeconds,
  captionPosition,
  fontFamily,
}: {
  videoSrc: string;
  assContent: string;
  subtitleStyle: string | null | undefined;
  aspectRatio?: string | null;
  audioDurationSeconds?: number | null;
  captionPosition?: "top" | "center" | "bottom";
  fontFamily?: string | null;
}): Promise<string | null> => {
  const style = normalizeSubtitleStyle(subtitleStyle);
  if (!isTikTokSubtitleStyle(style)) {
    return null;
  }

  const captions = parseAssToCaptions(assContent);
  if (captions.length === 0) {
    throw new Error("No caption tokens parsed from ASS subtitle content");
  }

  const pages = createTikTokPages({ captions, style });
  const fps = 30;
  const { width, height } = getCaptionResolution(aspectRatio ?? undefined);
  const estimatedDurationSeconds = Math.max(
    8,
    Math.ceil((audioDurationSeconds ?? 0) + 6),
  );
  const durationInFrames = estimatedDurationSeconds * fps;
  const outputLocation = path.join(
    os.tmpdir(),
    `captioned-video-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
  );

  // Download remote video to local disk so Remotion reads frames locally
  // instead of making an HTTP round-trip per frame through its proxy (~465ms/frame → ~5ms/frame)
  let localVideoPath: string | null = null;
  let effectiveVideoSrc = videoSrc;
  if (videoSrc.startsWith("http")) {
    localVideoPath = await downloadVideoToLocal(videoSrc);
    effectiveVideoSrc = localVideoPath;
  }

  try {
    const serveUrl = await getServeUrl();
    const envConfig = getRenderConfig();

    const sharedInputProps = {
      videoSrc: effectiveVideoSrc,
      pages,
      fps,
      stylePreset: style,
      captionPosition: captionPosition || "bottom",
      fontFamily: fontFamily || undefined,
    };

    const scaledWidth = Math.round(width * envConfig.scale);
    const scaledHeight = Math.round(height * envConfig.scale);
    console.log(`[REMOTION] Environment: ${getHostEnvName()}, concurrency: ${envConfig.concurrency ?? 'auto'}, timeout: ${envConfig.timeoutInMilliseconds}ms, resolution: ${scaledWidth}x${scaledHeight} (scale: ${envConfig.scale}), frames: ${durationInFrames}`);

    const compStart = Date.now();
    const composition = await selectComposition({
      serveUrl,
      id: "CaptionedVideo",
      inputProps: sharedInputProps,
      timeoutInMilliseconds: envConfig.timeoutInMilliseconds,
      chromiumOptions: envConfig.chromiumOptions,
    });
    console.log(`[REMOTION] selectComposition took ${Date.now() - compStart}ms`);

    const renderStart = Date.now();
    await renderMedia({
      serveUrl,
      codec: "h264",
      composition: {
        ...composition,
        fps,
        width: scaledWidth,
        height: scaledHeight,
        durationInFrames,
      },
      inputProps: sharedInputProps,
      outputLocation,
      overwrite: true,
      muted: false,
      imageFormat: "jpeg",
      jpegQuality: envConfig.jpegQuality,
      crf: 23,
      concurrency: envConfig.concurrency,
      timeoutInMilliseconds: envConfig.timeoutInMilliseconds,
      chromiumOptions: envConfig.chromiumOptions,
      ...(envConfig.offthreadVideoCacheSizeInBytes ? { offthreadVideoCacheSizeInBytes: envConfig.offthreadVideoCacheSizeInBytes } : {}),
      disallowParallelEncoding: envConfig.disallowParallelEncoding,
      logLevel: envConfig.logLevel,
    });
    console.log(`[REMOTION] renderMedia took ${Date.now() - renderStart}ms (${durationInFrames} frames, ${((Date.now() - renderStart) / durationInFrames).toFixed(1)}ms/frame)`);

    return outputLocation;
  } finally {
    if (localVideoPath) {
      try { fs.unlinkSync(localVideoPath); } catch {}
    }
  }
};

export const renderVideoWithTextOverlay = async ({
  videoSrc,
  textOverlay,
  textPosition,
  aspectRatio,
  audioDurationSeconds,
  fontFamily,
}: {
  videoSrc: string;
  textOverlay: string;
  textPosition: "top" | "center" | "bottom";
  aspectRatio?: string | null;
  audioDurationSeconds?: number | null;
  fontFamily?: string | null;
}): Promise<string | null> => {
  if (!textOverlay || !textOverlay.trim()) {
    return null;
  }

  // Parse text overlay into lines with timestamps (5 seconds per line)
  const lines = textOverlay
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const textLines = lines.map((text, index) => ({
    text,
    startTime: index * 5, // Each line starts 5 seconds after the previous
    duration: 5, // Each line displays for 5 seconds
  }));

  const fps = 30;
  const { width, height } = getCaptionResolution(aspectRatio ?? undefined);
  const estimatedDurationSeconds = Math.max(
    8,
    Math.ceil((audioDurationSeconds ?? 0) + 6),
  );
  const durationInFrames = estimatedDurationSeconds * fps;
  const outputLocation = path.join(
    os.tmpdir(),
    `text-overlay-video-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
  );

  let localVideoPath: string | null = null;
  let effectiveVideoSrc = videoSrc;
  if (videoSrc.startsWith("http")) {
    localVideoPath = await downloadVideoToLocal(videoSrc);
    effectiveVideoSrc = localVideoPath;
  }

  try {
    const serveUrl = await getServeUrl();
    const envConfig = getRenderConfig();

    const sharedInputProps = {
      videoSrc: effectiveVideoSrc,
      textLines,
      textPosition,
      fps,
      fontFamily: fontFamily || undefined,
    };

    const composition = await selectComposition({
      serveUrl,
      id: "TextOverlay",
      inputProps: sharedInputProps,
      timeoutInMilliseconds: envConfig.timeoutInMilliseconds,
      chromiumOptions: envConfig.chromiumOptions,
    });

    const scaledWidth = Math.round(width * envConfig.scale);
    const scaledHeight = Math.round(height * envConfig.scale);
    console.log(`[TEXT_OVERLAY] Starting render with ${textLines.length} text lines, duration: ${durationInFrames} frames, font: ${fontFamily || 'Inter'}, env: ${getHostEnvName()}, resolution: ${scaledWidth}x${scaledHeight}`);
    
    const renderStart = Date.now();
    await renderMedia({
      serveUrl,
      codec: "h264",
      composition: {
        ...composition,
        fps,
        width: scaledWidth,
        height: scaledHeight,
        durationInFrames,
      },
      inputProps: sharedInputProps,
      outputLocation,
      overwrite: true,
      muted: false,
      imageFormat: "jpeg",
      jpegQuality: envConfig.jpegQuality,
      crf: 23,
      concurrency: envConfig.concurrency,
      timeoutInMilliseconds: envConfig.timeoutInMilliseconds,
      chromiumOptions: envConfig.chromiumOptions,
      ...(envConfig.offthreadVideoCacheSizeInBytes ? { offthreadVideoCacheSizeInBytes: envConfig.offthreadVideoCacheSizeInBytes } : {}),
      disallowParallelEncoding: envConfig.disallowParallelEncoding,
      logLevel: envConfig.logLevel,
    });

    console.log(`[TEXT_OVERLAY] Render completed in ${Date.now() - renderStart}ms (${durationInFrames} frames, ${((Date.now() - renderStart) / durationInFrames).toFixed(1)}ms/frame): ${outputLocation}`);
    
    if (!fs.existsSync(outputLocation)) {
      console.error(`[TEXT_OVERLAY] ERROR: Output file was not created: ${outputLocation}`);
      return null;
    }
    
    const stats = fs.statSync(outputLocation);
    console.log(`[TEXT_OVERLAY] Output file size: ${stats.size} bytes`);
    
    return outputLocation;
  } catch (error) {
    console.error(`[TEXT_OVERLAY] Render failed:`, error);
    throw error;
  } finally {
    if (localVideoPath) {
      try { fs.unlinkSync(localVideoPath); } catch {}
    }
  }
};

export const deleteRenderedVideoIfExists = (filePath: string | null) => {
  if (!filePath) return;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

