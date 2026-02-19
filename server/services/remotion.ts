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
  
  // Configure bundler to help resolve node_modules
  // This is critical for resolving @remotion/google-fonts and other dependencies
  // The bundler needs to know where to find node_modules relative to the project root
  const nodeModulesPath = path.resolve(projectRoot, "node_modules");
  
  // Verify node_modules exists (helpful for debugging)
  if (!fs.existsSync(nodeModulesPath)) {
    console.warn(`[REMOTION] Warning: node_modules not found at ${nodeModulesPath}`);
  }
  
  // Configure bundler with webpackOverride to help resolve node_modules
  // This is critical for resolving @remotion/google-fonts on Replit
  // Use a minimal override that only touches resolve.modules to avoid breaking webpack plugins
  cachedServeUrl = await bundle(finalEntryPoint, {
    webpackOverride: (config) => {
      const projectNodeModules = path.resolve(projectRoot, "node_modules");
      
      // Only modify resolve.modules - be very careful not to break webpack's internal setup
      if (config.resolve) {
        const existingModules = config.resolve.modules;
        if (Array.isArray(existingModules)) {
          // Add project node_modules to the front if not already present
          if (!existingModules.includes(projectNodeModules)) {
            config.resolve.modules = [projectNodeModules, ...existingModules];
          }
        } else if (existingModules) {
          // If it's a single value, convert to array
          config.resolve.modules = [projectNodeModules, existingModules];
        } else {
          // If undefined, set to array with project node_modules first
          config.resolve.modules = [projectNodeModules, "node_modules"];
        }
      } else {
        // If resolve doesn't exist, create it (shouldn't happen but be safe)
        config.resolve = {
          modules: [projectNodeModules, "node_modules"],
        };
      }
      
      return config;
    },
  });
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
  });

  return outputLocation;
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

