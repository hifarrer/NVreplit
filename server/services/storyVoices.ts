import fs from "fs";
import path from "path";
import { STORY_INWORLD_VOICE_IDS } from "@shared/storyConstants";

export interface StoryVoiceOption {
  id: string;
  previewUrl: string;
}

/** Bunny CDN base for voice samples (no trailing slash). Override with STORY_VOICE_CDN_BASE. */
function getVoicePreviewBaseUrl(): string {
  const raw =
    process.env.STORY_VOICE_CDN_BASE?.trim() ||
    "https://neonvideo.b-cdn.net/voices";
  return raw.replace(/\/+$/, "");
}

function previewUrlForVoiceId(id: string): string {
  const base = getVoicePreviewBaseUrl();
  return `${base}/${encodeURIComponent(`${id}.mp3`)}`;
}

/**
 * Story voice dropdown + preview URLs.
 * Previews are served from Bunny CDN: `{STORY_VOICE_CDN_BASE}/{voice_id}.mp3` (default neonvideo.b-cdn.net/voices).
 * Optional: if `public/voices` contains .mp3 files, only those voice IDs are listed (filename without extension = id).
 */
export function listStoryVoiceOptions(): StoryVoiceOption[] {
  const dir = path.join(process.cwd(), "public", "voices");
  try {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => /\.mp3$/i.test(f));
      if (files.length > 0) {
        return files
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
          .map((filename) => {
            const id = filename.replace(/\.mp3$/i, "");
            return {
              id,
              previewUrl: previewUrlForVoiceId(id),
            };
          });
      }
    }
  } catch (e) {
    console.warn("[story voices] Could not read public/voices:", e);
  }

  return STORY_INWORLD_VOICE_IDS.map((id) => ({
    id,
    previewUrl: previewUrlForVoiceId(id),
  }));
}
