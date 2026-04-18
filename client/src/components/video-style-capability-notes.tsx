import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NOTES = {
  "pro-mode": {
    pros: [
      "Character customization",
      "Scene customization",
      "Character Singing",
      "Full Control",
    ],
    cons: ["Limited Length based on credits"],
  },
  "simple-mode": {
    pros: [
      "Single prompt to describe character",
      "Attach your own music",
      "Attach your own character image (singer)",
      "Character Singing",
      "Edit and Regenerate video",
    ],
    cons: [
      "No character customization",
      "Limited control",
      "Limited Length based on credits",
    ],
  },
  "loop-video": {
    pros: [
      "Attach your own music",
      "Song length is NOT limited by credits",
      "Cheap option for full length songs",
    ],
    cons: [
      "No character customization",
      "No characters singing",
      "Limited control",
      "Can't edit",
    ],
  },
  "single-prompt": {
    pros: [
      "Create music,character,scenes and entire video from a single prompt.",
    ],
    cons: [
      "No character customization",
      "No characters singing",
      "Limited control",
    ],
  },
  instrumental: {
    pros: [
      "Great for videos without singing characters",
      "Great for motivational videos",
    ],
    cons: [
      "No character customization",
      "No characters singing",
      "Limited control",
      "Can't edit",
    ],
  },
  lyric: {
    pros: ["Great to create videos with TikTok style lyrics"],
    cons: [
      "No character customization",
      "No Scene customization",
      "No characters singing",
      "Limited control",
      "Can't edit",
    ],
  },
  "video-shorts": {
    pros: [
      "Great for short TikTok style videos (12 seconds)",
      "Cheap option to generate videos",
    ],
    cons: [
      "No characters in video",
      "No Scene customization",
      "No characters singing",
      "Limited control",
      "Can't edit",
    ],
  },
  "motion-control": {
    pros: [
      "Transfer motion from any video to an image",
      "Supports YouTube links and direct .mp4 URLs",
      "Select from character library or upload image",
      "Keeps original video sound",
    ],
    cons: [
      "Maximum 30 seconds",
      "No character singing",
      "No scene customization",
      "Can't edit after generation",
    ],
  },
  swap: {
    pros: [
      "Replace a person, object, or background using a reference image",
      "Supports YouTube links and direct .mp4 URLs",
      "Select from character library or upload image",
      "Person, object, or background swap modes",
    ],
    cons: [
      "Maximum 14 seconds",
      "No character singing",
      "No scene customization",
      "Can't edit after generation",
      "Generation can take a long time",
    ],
  },
  reimagine: {
    pros: [
      "Transform video style with an AI prompt",
      "Supports YouTube links and direct .mp4 URLs",
      "Up to 30 seconds",
      "Keeps original audio",
    ],
    cons: [
      "No character customization",
      "No character singing",
      "Can't edit after generation",
    ],
  },
} as const;

export type VideoStyleCapabilityVariant = keyof typeof NOTES;

type VideoStyleCapabilityNotesProps = {
  variant: VideoStyleCapabilityVariant;
  className?: string;
};

export function VideoStyleCapabilityNotes({ variant, className }: VideoStyleCapabilityNotesProps) {
  const { pros, cons } = NOTES[variant];

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5 text-[10px] sm:gap-4 sm:text-xs sm:px-4",
        "leading-snug",
        className
      )}
      data-testid="video-style-capability-notes"
    >
      <ul className="m-0 min-w-0 list-none space-y-1 p-0">
        {pros.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Check
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            <span className="text-emerald-700 dark:text-emerald-400">{line}</span>
          </li>
        ))}
      </ul>
      <ul className="m-0 min-w-0 list-none space-y-1 border-l border-border/50 p-0 pl-3 sm:pl-4">
        {cons.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            <span className="text-red-700 dark:text-red-400">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
