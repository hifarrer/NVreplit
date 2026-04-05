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

export interface StoryScene {
  id: number;
  character: string;
  audio: string;
  scene_description: string;
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
