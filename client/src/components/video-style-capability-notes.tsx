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
        "rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5 text-[11px] sm:text-xs leading-snug",
        className
      )}
      data-testid="video-style-capability-notes"
    >
      <ul className="m-0 list-none space-y-1 p-0">
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
      <ul className="m-0 mt-2 list-none space-y-1 border-t border-border/50 p-0 pt-2">
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
