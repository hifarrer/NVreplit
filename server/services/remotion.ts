import fs from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { normalizeSubtitleStyle, isTikTokSubtitleStyle, parseAssToCaptions, createTikTokPages } from "./captions";

const RAILWAY_REMOTION_URL = process.env.REMOTION_RENDER_URL || "";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Submit a render job to the Railway Remotion service and poll until
 * the output file is ready, then download it to a local temp path.
 */
const renderViaRailway = async (
  compositionId: string,
  inputProps: Record<string, unknown>,
  outputPrefix: string,
): Promise<string> => {
  const renderUrl = `${RAILWAY_REMOTION_URL}/render`;
  console.log(`[REMOTION-RAILWAY] Submitting render for ${compositionId} to ${renderUrl}`);
  const submitStart = Date.now();

  const submitRes = await fetch(renderUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compositionId, inputProps }),
  });

  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(
      `Railway Remotion render submission failed (${submitRes.status}): ${body}`,
    );
  }

  const submitData = (await submitRes.json()) as { message?: string; fileName?: string };
  const fileName = submitData.fileName;
  if (!fileName) {
    throw new Error(
      `Railway Remotion returned no fileName: ${JSON.stringify(submitData)}`,
    );
  }

  console.log(`[REMOTION-RAILWAY] Render queued, fileName: ${fileName} (submitted in ${Date.now() - submitStart}ms)`);

  const downloadUrl = `${RAILWAY_REMOTION_URL}/download/${fileName}`;
  const pollStart = Date.now();
  let attempts = 0;

  while (Date.now() - pollStart < MAX_POLL_DURATION_MS) {
    attempts++;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const headRes = await fetch(downloadUrl, { method: "HEAD" });
      if (headRes.ok) {
        console.log(
          `[REMOTION-RAILWAY] Render ready after ${attempts} polls (${Math.round((Date.now() - pollStart) / 1000)}s)`,
        );
        break;
      }
    } catch {
      // Network hiccup — retry
    }

    if (attempts % 10 === 0) {
      console.log(
        `[REMOTION-RAILWAY] Still waiting for ${fileName}... (${Math.round((Date.now() - pollStart) / 1000)}s elapsed)`,
      );
    }
  }

  const dlRes = await fetch(downloadUrl);
  if (!dlRes.ok || !dlRes.body) {
    throw new Error(
      `Railway Remotion download failed after ${Math.round((Date.now() - pollStart) / 1000)}s: ${dlRes.status} ${dlRes.statusText}`,
    );
  }

  const outputLocation = path.join(
    os.tmpdir(),
    `${outputPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
  );

  const fileStream = fs.createWriteStream(outputLocation);
  await pipeline(Readable.fromWeb(dlRes.body as any), fileStream);

  const stat = fs.statSync(outputLocation);
  console.log(
    `[REMOTION-RAILWAY] Downloaded rendered video (${(stat.size / 1024 / 1024).toFixed(1)} MB) to ${outputLocation} — total time: ${Math.round((Date.now() - submitStart) / 1000)}s`,
  );

  return outputLocation;
};

const getCaptionResolution = (
  aspectRatio: string | undefined,
): { width: number; height: number } => {
  if (aspectRatio === "16:9") {
    return { width: 1920, height: 1080 };
  }
  return { width: 1080, height: 1440 };
};

/**
 * No-op — local browser warm-up is no longer needed when using Railway.
 * Kept for backwards compatibility with server bootstrap code.
 */
export const warmUpRemotionRenderer = async () => {
  console.log(`[REMOTION-RAILWAY] Using remote Railway renderer at ${RAILWAY_REMOTION_URL} — no local warm-up needed`);
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

  console.log(
    `[REMOTION-RAILWAY] Rendering CaptionedVideo: ${durationInFrames} frames, ${width}x${height}, style=${style}, position=${captionPosition || "bottom"}`,
  );

  const inputProps = {
    videoSrc,
    pages,
    fps,
    stylePreset: style,
    captionPosition: captionPosition || "bottom",
    fontFamily: fontFamily || undefined,
    width,
    height,
    durationInFrames,
  };

  return renderViaRailway("CaptionedVideo", inputProps, "captioned-video");
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

  const lines = textOverlay
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const textLines = lines.map((text, index) => ({
    text,
    startTime: index * 5,
    duration: 5,
  }));

  const fps = 30;
  const { width, height } = getCaptionResolution(aspectRatio ?? undefined);
  const estimatedDurationSeconds = Math.max(
    8,
    Math.ceil((audioDurationSeconds ?? 0) + 6),
  );
  const durationInFrames = estimatedDurationSeconds * fps;

  console.log(
    `[REMOTION-RAILWAY] Rendering TextOverlay: ${textLines.length} lines, ${durationInFrames} frames, ${width}x${height}, position=${textPosition}`,
  );

  const inputProps = {
    videoSrc,
    textLines,
    textPosition,
    fps,
    fontFamily: fontFamily || undefined,
    width,
    height,
    durationInFrames,
  };

  return renderViaRailway("TextOverlay", inputProps, "text-overlay-video");
};

export const deleteRenderedVideoIfExists = (filePath: string | null) => {
  if (!filePath) return;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};
