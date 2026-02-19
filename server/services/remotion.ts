import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { normalizeSubtitleStyle, isTikTokSubtitleStyle, parseAssToCaptions, createTikTokPages } from "./captions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedServeUrl: string | null = null;

const setupLibraryPath = () => {
  if (process.platform === "linux") {
    const currentLdPath = process.env.LD_LIBRARY_PATH || "";
    const commonLibPaths = [
      "/usr/lib",
      "/usr/lib/x86_64-linux-gnu",
      "/lib/x86_64-linux-gnu",
      "/lib64",
      "/nix/store",
    ];
    
    const libPaths = commonLibPaths.filter(Boolean).join(":");
    
    if (currentLdPath && !currentLdPath.includes("/nix/store")) {
      if (!currentLdPath.includes(libPaths)) {
        process.env.LD_LIBRARY_PATH = `${currentLdPath}:${libPaths}`;
      }
    } else if (!currentLdPath) {
      process.env.LD_LIBRARY_PATH = libPaths;
    }
    
    console.log(`[REMOTION] LD_LIBRARY_PATH: ${process.env.LD_LIBRARY_PATH}`);
  }
};

setupLibraryPath();

// Chromium flags for constrained server environments (Replit production, Docker, etc.)
const CHROMIUM_OPTIONS = {
  disableWebSecurity: true,
  gl: "swiftshader" as const,
  headless: true,
  enableMultiProcessOnLinux: false,
};

// Longer timeout for production where the browser may take longer to start
const BROWSER_TIMEOUT_MS = 120_000;

// Retry when Chromium tab crashes (Target closed / ProtocolError) - common on Replit
const REMOTION_CAPTION_MAX_RETRIES = 3;
const REMOTION_RETRY_DELAY_MS = 3000;

function isRetryableRemotionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Target closed") ||
    msg.includes("ProtocolError") ||
    msg.includes("Protocol error")
  );
}

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

  const serveUrl = await getServeUrl();

  let lastError: unknown;
  for (let attempt = 1; attempt <= REMOTION_CAPTION_MAX_RETRIES; attempt++) {
    try {
      const composition = await selectComposition({
        serveUrl,
        id: "CaptionedVideo",
        inputProps: {
          videoSrc,
          pages,
          fps,
          stylePreset: style,
          captionPosition: captionPosition || "bottom",
          fontFamily: fontFamily || undefined,
        },
        chromiumOptions: CHROMIUM_OPTIONS,
        timeoutInMilliseconds: BROWSER_TIMEOUT_MS,
      });

      await renderMedia({
        serveUrl,
        codec: "h264",
        composition: {
          ...composition,
          fps,
          width,
          height,
          durationInFrames,
        },
        inputProps: {
          videoSrc,
          pages,
          fps,
          stylePreset: style,
          captionPosition: captionPosition || "bottom",
          fontFamily: fontFamily || undefined,
        },
        outputLocation,
        overwrite: true,
        muted: false,
        imageFormat: "jpeg",
        crf: 18,
        chromiumOptions: CHROMIUM_OPTIONS,
        timeoutInMilliseconds: BROWSER_TIMEOUT_MS,
      });

      return outputLocation;
    } catch (err) {
      lastError = err;
      if (attempt < REMOTION_CAPTION_MAX_RETRIES && isRetryableRemotionError(err)) {
        console.warn(
          `[REMOTION] Caption render attempt ${attempt}/${REMOTION_CAPTION_MAX_RETRIES} failed (Target closed/ProtocolError), retrying in ${REMOTION_RETRY_DELAY_MS}ms...`,
          err instanceof Error ? err.message : err,
        );
        await new Promise((r) => setTimeout(r, REMOTION_RETRY_DELAY_MS));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
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

  const serveUrl = await getServeUrl();

  const composition = await selectComposition({
    serveUrl,
    id: "TextOverlay",
    inputProps: {
      videoSrc,
      textLines,
      textPosition,
      fps,
      fontFamily: fontFamily || undefined,
    },
    chromiumOptions: CHROMIUM_OPTIONS,
    timeoutInMilliseconds: BROWSER_TIMEOUT_MS,
  });

  console.log(`[TEXT_OVERLAY] Starting render with ${textLines.length} text lines, duration: ${durationInFrames} frames, font: ${fontFamily || 'Inter'}`);
  
  try {
    await renderMedia({
      serveUrl,
      codec: "h264",
      composition: {
        ...composition,
        fps,
        width,
        height,
        durationInFrames,
      },
      inputProps: {
        videoSrc,
        textLines,
        textPosition,
        fps,
        fontFamily: fontFamily || undefined,
      },
      outputLocation,
      overwrite: true,
      muted: false,
      imageFormat: "jpeg",
      crf: 18,
      chromiumOptions: CHROMIUM_OPTIONS,
      timeoutInMilliseconds: BROWSER_TIMEOUT_MS,
    });

    console.log(`[TEXT_OVERLAY] Render completed successfully: ${outputLocation}`);
    
    // Verify the file was created
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
  }
};

export const deleteRenderedVideoIfExists = (filePath: string | null) => {
  if (!filePath) return;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

