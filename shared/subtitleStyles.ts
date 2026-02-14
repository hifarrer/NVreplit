export const subtitleStyles = [
  "plain-white",
  "yellow-bg",
  "pink-bg",
  "blue-bg",
  "red-bg",
] as const;

export type SubtitleStyle = (typeof subtitleStyles)[number];

type LegacySubtitleStyle =
  | "classic"
  | "tiktok-pop"
  | "tiktok-bold"
  | "tiktok-karaoke"
  | "tiktok-minimal";

const legacySubtitleStyleMap: Record<LegacySubtitleStyle, SubtitleStyle> = {
  classic: "plain-white",
  "tiktok-pop": "yellow-bg",
  "tiktok-bold": "pink-bg",
  "tiktok-karaoke": "yellow-bg",
  "tiktok-minimal": "plain-white",
};

export const defaultSubtitleStyle: SubtitleStyle = "plain-white";

export const subtitleStyleOptions: Array<{
  value: SubtitleStyle;
  label: string;
  preview: string;
}> = [
  {
    value: "plain-white",
    label: "Plain White",
    preview: "White text",
  },
  {
    value: "yellow-bg",
    label: "Yellow BG",
    preview: "White text on yellow background",
  },
  {
    value: "pink-bg",
    label: "Pink BG",
    preview: "White text on pink background",
  },
  {
    value: "blue-bg",
    label: "Blue BG",
    preview: "White text on blue background",
  },
  {
    value: "red-bg",
    label: "Red BG",
    preview: "White text on red background",
  },
];

export const isSubtitleStyle = (value: unknown): value is SubtitleStyle => {
  return (
    typeof value === "string" &&
    subtitleStyles.includes(value as SubtitleStyle)
  );
};

export const coerceSubtitleStyle = (value: unknown): SubtitleStyle => {
  if (isSubtitleStyle(value)) {
    return value;
  }

  if (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(legacySubtitleStyleMap, value)
  ) {
    return legacySubtitleStyleMap[value as LegacySubtitleStyle];
  }

  return defaultSubtitleStyle;
};

