/** Inworld 1.5 Mini TTS voice IDs (WaveSpeed). Match MP3 filenames in `public/voices/{id}.mp3` for previews. */
export const STORY_INWORLD_VOICE_IDS = [
  // English
  "Alex",
  "Ashley",
  "Craig",
  "Deborah",
  "Dennis",
  "Edward",
  "Elizabeth",
  "Hades",
  "Julia",
  "Pixie",
  "Mark",
  "Olivia",
  "Priya",
  "Ronald",
  "Sarah",
  "Shaun",
  "Theodore",
  "Timothy",
  "Wendy",
  "Dominus",
  "Hana",
  "Clive",
  "Carter",
  "Blake",
  "Luna",
  // Chinese
  "Yichen",
  "Xiaoyin",
  "Xinyi",
  "Jing",
  // Japanese
  "Asuka",
  "Satoshi",
  // Korean
  "Hyunwoo",
  "Minji",
  "Seojun",
  "Yoona",
  // French
  "Alain",
  "Hélène",
  "Mathieu",
  "Étienne",
  // German
  "Johanna",
  "Josef",
  // Spanish
  "Diego",
  "Lupita",
  "Miguel",
  "Rafael",
  // Portuguese
  "Heitor",
  "Maitê",
  // Italian
  "Gianni",
  "Orietta",
  // Dutch
  "Erik",
  "Katrien",
  "Lennart",
  "Lore",
  // Polish
  "Szymon",
  "Wojciech",
  // Russian
  "Svetlana",
  "Elena",
  "Dmitry",
  "Nikolai",
  // Hindi
  "Riya",
  "Manoj",
  // Hebrew
  "Yael",
  "Oren",
  // Arabic
  "Nour",
  "Omar",
] as const;

/** @deprecated Use STORY_INWORLD_VOICE_IDS — kept for imports that expect STORY_VOICE_IDS */
export const STORY_VOICE_IDS = STORY_INWORLD_VOICE_IDS;

export type StoryVoiceId = (typeof STORY_INWORLD_VOICE_IDS)[number];

export const STORY_DEFAULT_NARRATOR_VOICE = "Alex";

/**
 * Distinct English voices cycled through when characters have no explicit voiceId.
 * Deliberately avoids "Alex" (the narrator default) so characters sound different from narration.
 */
export const STORY_DEFAULT_CHARACTER_VOICE_POOL: readonly string[] = [
  "Ashley",
  "Craig",
  "Julia",
  "Ronald",
  "Olivia",
  "Dennis",
  "Elizabeth",
  "Shaun",
  "Deborah",
  "Edward",
];

/** Map legacy ElevenLabs preset names (stored on old projects) to Inworld voice IDs */
const LEGACY_ELEVENLABS_TO_INWORLD: Record<string, string> = {
  Aria: "Ashley",
  Roger: "Ronald",
  Sarah: "Sarah",
  Laura: "Luna",
  Charlie: "Carter",
  George: "Craig",
  Callum: "Clive",
  River: "Olivia",
  Liam: "Timothy",
  Charlotte: "Elizabeth",
  Alice: "Ashley",
  Matilda: "Deborah",
  Will: "Shaun",
  Jessica: "Julia",
  Eric: "Edward",
  Chris: "Craig",
  Brian: "Blake",
  Daniel: "Dennis",
  Lily: "Olivia",
  Bill: "Blake",
};

export function normalizeStoryVoiceId(voiceId: string | null | undefined): string {
  const trimmed = (voiceId ?? "").trim();
  if (!trimmed) {
    return STORY_DEFAULT_NARRATOR_VOICE;
  }
  const mapped = LEGACY_ELEVENLABS_TO_INWORLD[trimmed];
  if (mapped) {
    return mapped;
  }
  const exact = STORY_INWORLD_VOICE_IDS.find((id) => id === trimmed);
  if (exact) {
    return exact;
  }
  return STORY_DEFAULT_NARRATOR_VOICE;
}

/** WaveSpeed infinitetalk/multi: speaking order for left vs right audio. */
export const STORY_MULTI_TALK_ORDERS = ["left_right", "right_left", "meanwhile"] as const;
export type StoryMultiTalkOrder = (typeof STORY_MULTI_TALK_ORDERS)[number];

export function normalizeStoryMultiTalkOrder(v: string | null | undefined): StoryMultiTalkOrder {
  const x = (v || "").trim().toLowerCase();
  if (x === "right_left" || x === "meanwhile") return x;
  return "left_right";
}

export interface StoryScene {
  id: number;
  character: string;
  audio: string;
  scene_description: string;
  /**
   * Two characters visible in frame with separate voices — use infinitetalk/multi (not single infinitetalk-fast).
   * When true, use audio_left/audio_right and character_left/character_right; `audio` may summarize both for UI.
   */
  multi_talk?: boolean;
  /** Character on the LEFT side of the frame (viewer perspective); must match a story character name or Narrator. */
  character_left?: string;
  /** Character on the RIGHT side of the frame. */
  character_right?: string;
  /** Line spoken by the left character (~half the clip). */
  audio_left?: string;
  /** Line spoken by the right character. */
  audio_right?: string;
  /** Who speaks first / how audio is sequenced in the multi model. Default left_right. */
  multi_talk_order?: StoryMultiTalkOrder;
}

export interface StoryCharacter {
  name: string;
  imageUrl: string;
  voiceId: string | null;
  prompt: string;
}

export const STORY_DURATION_MIN = 30;
export const STORY_DURATION_MAX = 300;
export const STORY_MAX_CHARACTERS = 3;

/** Credits charged when starting the story video pipeline (assets + final render), per 30s of target duration */
export const STORY_VIDEO_CREDITS_PER_30_SECONDS = 2000;

/** Total credits for a story video at the given target duration (rounded up to 30s blocks, clamped to min/max). */
export function getStoryVideoGenerationCredits(durationSeconds: number): number {
  const d = Math.max(
    STORY_DURATION_MIN,
    Math.min(STORY_DURATION_MAX, Math.floor(Number(durationSeconds)) || STORY_DURATION_MIN),
  );
  return Math.ceil(d / 30) * STORY_VIDEO_CREDITS_PER_30_SECONDS;
}
