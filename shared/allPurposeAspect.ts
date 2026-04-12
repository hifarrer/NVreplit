/** Aspect ratios supported by All Purpose video creation (UI + server). */
export const ALL_PURPOSE_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
export type AllPurposeAspectRatio = (typeof ALL_PURPOSE_ASPECT_RATIOS)[number];

/** Size strings for `alibaba/wan-2.7/text-to-image` (and align with Seedream v4.5 edit sizes). */
export const ALL_PURPOSE_IMAGE_SIZE_BY_ASPECT: Record<AllPurposeAspectRatio, string> = {
  "1:1": "2048*2048",
  "16:9": "2560*1440",
  "9:16": "1440*2560",
  "4:3": "2304*1728",
  "3:4": "1728*2304",
};

export function isAllPurposeAspectRatio(value: string): value is AllPurposeAspectRatio {
  return (ALL_PURPOSE_ASPECT_RATIOS as readonly string[]).includes(value);
}

export function allPurposeImageSizeForAspect(aspect: string): string {
  if (isAllPurposeAspectRatio(aspect)) {
    return ALL_PURPOSE_IMAGE_SIZE_BY_ASPECT[aspect];
  }
  return ALL_PURPOSE_IMAGE_SIZE_BY_ASPECT["9:16"];
}

/** Pixel dimensions string for FFMPEG merge (width x height). */
export function allPurposeMergeVideoDimensions(aspectRatio: string): string {
  switch (aspectRatio) {
    case "9:16":
      return "1080x1920";
    case "3:4":
      return "1080x1440";
    case "1:1":
      return "1080x1080";
    case "4:3":
      return "1920x1440";
    case "16:9":
    default:
      return "1920x1080";
  }
}

export function allPurposeUsePortraitOutro(aspectRatio: string): boolean {
  return aspectRatio === "9:16" || aspectRatio === "3:4";
}
