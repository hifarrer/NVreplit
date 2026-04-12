import { cn } from "@/lib/utils";

type ResponsiveFinalVideoProps = {
  src: string;
  className?: string;
  videoClassName?: string;
};

/** Final output video: stays within the viewport on desktop for any aspect ratio (e.g. 9:16 portrait). */
export function ResponsiveFinalVideo({ src, className, videoClassName }: ResponsiveFinalVideoProps) {
  return (
    <div
      className={cn(
        "flex w-full justify-center overflow-hidden rounded-lg bg-muted/20 p-2 sm:p-3",
        className,
      )}
    >
      <video
        controls
        playsInline
        className={cn(
          "mx-auto h-auto w-auto max-h-[min(85vh,85dvh)] max-w-full rounded-lg object-contain shadow-md",
          "sm:max-h-[min(85vh,90dvh)]",
          videoClassName,
        )}
        src={src}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
