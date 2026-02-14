import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import {
  coerceSubtitleStyle,
  defaultSubtitleStyle,
  type SubtitleStyle,
} from "@shared/subtitleStyles";

export interface AssCaptionToken {
  startMs: number;
  endMs: number;
  text: string;
}

export type TikTokCaptionPage = ReturnType<
  typeof createTikTokStyleCaptions
>["pages"][number];

const parseAssTimestampToMs = (input: string): number => {
  const [hours, minutes, secondsWithCs] = input.split(":");
  const [seconds, centiseconds = "0"] = secondsWithCs.split(".");
  return (
    Number(hours) * 3600 * 1000 +
    Number(minutes) * 60 * 1000 +
    Number(seconds) * 1000 +
    Number(centiseconds.padEnd(2, "0").slice(0, 2)) * 10
  );
};

const cleanAssText = (input: string): string => {
  return input.replace(/\\N/g, " ").replace(/\{[^}]*\}/g, "").trim();
};

export const parseAssToTokens = (assContent: string): AssCaptionToken[] => {
  const lines = assContent.split("\n");
  const tokens: AssCaptionToken[] = [];

  for (const line of lines) {
    if (!line.startsWith("Dialogue:")) {
      continue;
    }

    // Dialogue: Marked=0,start,end,Style,Name,MarginL,MarginR,MarginV,Effect,Text
    const parts = line.split(",");
    if (parts.length < 10) {
      continue;
    }

    const startMs = parseAssTimestampToMs(parts[1]);
    const endMs = parseAssTimestampToMs(parts[2]);
    const text = cleanAssText(parts.slice(9).join(","));

    if (!text || endMs <= startMs) {
      continue;
    }

    tokens.push({ startMs, endMs, text });
  }

  return tokens.sort((a, b) => a.startMs - b.startMs);
};

const formatAssTimestampFromMs = (inputMs: number): string => {
  const clamped = Math.max(0, Math.round(inputMs));
  const totalCentiseconds = Math.floor(clamped / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
};

export const trimAssToWindow = (
  assContent: string,
  startMs: number,
  endMs: number,
): string => {
  const safeStartMs = Math.max(0, Math.round(startMs));
  const safeEndMs = Math.max(safeStartMs, Math.round(endMs));
  const lines = assContent.split(/\r?\n/);
  const outputLines: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("Dialogue:")) {
      outputLines.push(line);
      continue;
    }

    const parts = line.split(",");
    if (parts.length < 10) {
      continue;
    }

    const lineStartMs = parseAssTimestampToMs(parts[1]);
    const lineEndMs = parseAssTimestampToMs(parts[2]);

    if (lineEndMs <= safeStartMs || lineStartMs >= safeEndMs) {
      continue;
    }

    const clippedStartMs = Math.max(lineStartMs, safeStartMs) - safeStartMs;
    const clippedEndMs = Math.min(lineEndMs, safeEndMs) - safeStartMs;
    if (clippedEndMs <= clippedStartMs) {
      continue;
    }

    parts[1] = formatAssTimestampFromMs(clippedStartMs);
    parts[2] = formatAssTimestampFromMs(clippedEndMs);
    outputLines.push(parts.join(","));
  }

  return outputLines.join("\n");
};

export const parseAssToTimestampedWords = (
  assContent: string,
): Array<{ start: number; end: number; text: string }> => {
  return parseAssToTokens(assContent).map((token) => ({
    start: token.startMs / 1000,
    end: token.endMs / 1000,
    text: token.text,
  }));
};

export const parseAssToCaptions = (assContent: string): Caption[] => {
  return parseAssToTokens(assContent).map((token) => {
    const midpointMs = token.startMs + (token.endMs - token.startMs) / 2;
    return {
      text: token.text,
      startMs: token.startMs,
      endMs: token.endMs,
      timestampMs: midpointMs,
      confidence: null,
    };
  });
};

const getCombineWindowForStyle = (style: SubtitleStyle): number => {
  // Keep cadence consistent across all karaoke presets.
  return 1100;
};

export const normalizeSubtitleStyle = (input: unknown): SubtitleStyle => {
  return coerceSubtitleStyle(input ?? defaultSubtitleStyle);
};

export const isTikTokSubtitleStyle = (style: SubtitleStyle): boolean => {
  return true;
};

export const createTikTokPages = ({
  captions,
  style,
}: {
  captions: Caption[];
  style: SubtitleStyle;
}) => {
  return createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: getCombineWindowForStyle(style),
  }).pages;
};

