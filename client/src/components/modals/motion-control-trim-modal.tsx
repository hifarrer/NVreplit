import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Loader2, Scissors } from "lucide-react";

const DEFAULT_MAX_WINDOW = 14;

interface MotionControlTrimModalProps {
  isOpen: boolean;
  videoUrl: string;
  onClose: () => void;
  onConfirm: (startTime: number, endTime: number) => void;
  isLoading?: boolean;
  maxWindow?: number;
  defaultSelectionLength?: number;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

export function MotionControlTrimModal({
  isOpen,
  videoUrl,
  onClose,
  onConfirm,
  isLoading,
  maxWindow,
  defaultSelectionLength,
}: MotionControlTrimModalProps) {
  const effectiveMaxWindow = maxWindow ?? DEFAULT_MAX_WINDOW;
  const effectiveDefaultSelectionLength = defaultSelectionLength ?? effectiveMaxWindow;
  const videoRef = useRef<HTMLVideoElement>(null);

  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [durationError, setDurationError] = useState<string | null>(null);

  const maxSelectableLength = Math.min(effectiveMaxWindow, duration || effectiveMaxWindow);
  const clipLength = Math.max(0.5, endTime - startTime || maxSelectableLength);

  useEffect(() => {
    if (!isOpen) {
      setDuration(0);
      setStartTime(0);
      setEndTime(0);
      setDurationError(null);
    }
  }, [isOpen]);

  const applyDuration = useCallback((d: number) => {
    if (Number.isFinite(d) && d > 0) {
      const initialLength = Math.min(effectiveDefaultSelectionLength, effectiveMaxWindow, d);
      setDuration(d);
      setStartTime(0);
      setEndTime(initialLength);
      setDurationError(null);
    } else {
      setDuration(0);
      setDurationError("Could not determine video length. Please enter start/end times manually.");
    }
  }, [effectiveDefaultSelectionLength, effectiveMaxWindow]);

  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (video) applyDuration(video.duration);
  }, [applyDuration]);

  const handleVideoError = useCallback(() => {
    setDuration(0);
    setDurationError("Video failed to load. Please enter start/end times manually.");
  }, []);

  // Fallback timeout: if metadata hasn't loaded within 15s, show manual inputs
  useEffect(() => {
    if (!isOpen || !videoUrl || duration > 0 || durationError) return;
    const timeout = setTimeout(() => {
      if (duration === 0 && !durationError) {
        setDurationError("Could not load video metadata. Please enter start/end times manually.");
      }
    }, 15000);
    return () => clearTimeout(timeout);
  }, [isOpen, videoUrl, duration, durationError]);

  const handleWindowMove = useCallback(
    ([newStart]: number[]) => {
      if (!Number.isFinite(newStart)) return;
      const maxStart = Math.max(0, duration - clipLength);
      const clampedStart = Math.min(Math.max(0, newStart), maxStart);
      setStartTime(clampedStart);
      setEndTime(clampedStart + clipLength);
    },
    [clipLength, duration],
  );

  const handleClipLengthChange = useCallback(
    ([nextLength]: number[]) => {
      if (!Number.isFinite(nextLength)) return;
      const clampedLength = Math.min(Math.max(0.5, nextLength), maxSelectableLength);
      const maxStart = Math.max(0, duration - clampedLength);
      const adjustedStart = Math.min(startTime, maxStart);
      setStartTime(adjustedStart);
      setEndTime(adjustedStart + clampedLength);
    },
    [duration, maxSelectableLength, startTime],
  );

  // Sync video preview to startTime
  useEffect(() => {
    const video = videoRef.current;
    if (video && duration > 0 && Number.isFinite(startTime)) {
      video.currentTime = startTime;
    }
  }, [startTime, duration]);

  const selectionDuration = Math.max(0, endTime - startTime);
  const canConfirm = selectionDuration >= 0.5 && selectionDuration <= effectiveMaxWindow + 0.1 && !isLoading;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 shrink-0" />
            Select Video Range
          </DialogTitle>
          <DialogDescription className="text-balance break-words pr-2">
            Choose up to {effectiveMaxWindow} seconds of the video. Drag one selection bar across the timeline, then optionally shorten the clip length.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 min-w-0 overflow-hidden">
          <video
            ref={videoRef}
            key={videoUrl}
            src={videoUrl}
            className="w-full rounded-md max-h-48 bg-black"
            preload="auto"
            controls
            muted
            onLoadedMetadata={handleVideoLoaded}
            onError={handleVideoError}
          />

          {durationError && (
            <p className="text-sm text-amber-600">{durationError}</p>
          )}

          {duration > 0 ? (
            <div className="min-w-0">
              <Label className="text-sm font-semibold mb-2 block">
                Timeline — drag the selection bar
              </Label>
              <SliderPrimitive.Root
                className="relative flex w-full touch-none select-none items-center"
                value={[startTime]}
                min={0}
                max={Math.max(0, duration - clipLength)}
                step={0.5}
                onValueChange={handleWindowMove}
              >
                <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full bg-secondary">
                  <div
                    className="absolute top-0 h-full rounded-full bg-primary"
                    style={{
                      left: `${duration > 0 ? (startTime / duration) * 100 : 0}%`,
                      width: `${duration > 0 ? (clipLength / duration) * 100 : 0}%`,
                    }}
                  />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-grab active:cursor-grabbing" />
              </SliderPrimitive.Root>

              <Label className="text-xs font-medium mt-4 mb-2 block">
                Clip length: {formatTime(clipLength)}
              </Label>
              <SliderPrimitive.Root
                className="relative flex w-full touch-none select-none items-center"
                value={[clipLength]}
                min={0.5}
                max={maxSelectableLength}
                step={0.5}
                onValueChange={handleClipLengthChange}
              >
                <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
                  <SliderPrimitive.Range className="absolute h-full bg-primary" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-grab active:cursor-grabbing" />
              </SliderPrimitive.Root>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{formatTime(startTime)}</span>
                <span>{formatTime(endTime)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Selected: {formatTime(selectionDuration)} / {effectiveMaxWindow}s max
                (total video: {formatTime(duration)})
              </p>
            </div>
          ) : !durationError ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading video metadata...
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <Label className="text-xs">Start (seconds)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={startTime}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    setStartTime(v);
                    if (endTime - v > effectiveMaxWindow) setEndTime(v + effectiveMaxWindow);
                    if (endTime <= v) setEndTime(v + 1);
                  }}
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">End (seconds)</Label>
                <Input
                  type="number"
                  min={startTime + 0.5}
                  step={0.5}
                  value={endTime}
                  onChange={(e) => {
                    const v = Number(e.target.value) || startTime + 1;
                    if (v - startTime > effectiveMaxWindow) return;
                    setEndTime(v);
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(startTime, endTime)}
            disabled={!canConfirm}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              `Confirm (${formatTime(selectionDuration)})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
