import { useState, useEffect, useRef } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AudioWaveformPlayerProps {
  audioUrl: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  onEnded?: () => void;
  /** Optional duration in seconds for layout before audio loads */
  duration?: number;
  className?: string;
}

const WAVEFORM_SAMPLES = 200;

export function AudioWaveformPlayer({
  audioUrl,
  isPlaying,
  onPlayPause,
  onEnded,
  duration: durationProp,
  className = "",
}: AudioWaveformPlayerProps) {
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationProp ?? 0);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Build waveform from audio URL
  useEffect(() => {
    if (!audioUrl) {
      setWaveformData([]);
      setIsLoadingWaveform(false);
      return;
    }
    let cancelled = false;
    let audioContext: AudioContext | null = null;
    setIsLoadingWaveform(true);

    const fetchWaveform = async () => {
      try {
        const response = await fetch(audioUrl);
        if (cancelled) return;
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        if (cancelled) {
          if (audioContext.state !== "closed") audioContext.close();
          return;
        }

        const rawData = audioBuffer.getChannelData(0);
        const samples = WAVEFORM_SAMPLES;
        const blockSize = Math.floor(rawData.length / samples) || 1;
        const filteredData: number[] = [];
        for (let i = 0; i < samples; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            const idx = i * blockSize + j;
            if (idx < rawData.length) sum += Math.abs(rawData[idx]);
          }
          filteredData.push(sum / blockSize);
        }
        const maxAmplitude = Math.max(...filteredData);
        const normalizedData = filteredData.map((n) => (maxAmplitude > 0 ? n / maxAmplitude : 0.3));
        if (!cancelled) setWaveformData(normalizedData);
        if (audioContext.state !== "closed") audioContext.close();
      } catch {
        if (!cancelled) {
          const fallback = Array.from({ length: WAVEFORM_SAMPLES }, () => Math.random() * 0.5 + 0.2);
          setWaveformData(fallback);
        }
      } finally {
        if (!cancelled) setIsLoadingWaveform(false);
      }
    };

    fetchWaveform();
    return () => {
      cancelled = true;
      if (audioContext && audioContext.state !== "closed") audioContext.close();
    };
  }, [audioUrl]);

  // Sync play/pause with audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying]);

  // Sync duration from audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoadedMetadata = () => setDuration(audio.duration);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);
    return () => audio.removeEventListener("loadedmetadata", onLoadedMetadata);
  }, [audioUrl]);

  const playheadPercent = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onEnded={() => onEnded?.()}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          if (d != null && isFinite(d)) setDuration(d);
        }}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onPlayPause}
        className="flex-shrink-0"
      >
        {isPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <div className="flex-1 min-w-0 relative h-10 bg-muted/50 rounded-lg flex items-center overflow-hidden">
        {isLoadingWaveform ? (
          <div className="flex items-center justify-center w-full gap-2 text-muted-foreground text-xs">
            <div className="w-4 h-4 border-2 border-muted-foreground/50 border-t-transparent rounded-full animate-spin" />
            <span>Loading waveform...</span>
          </div>
        ) : waveformData.length > 0 ? (
          <>
            <div className="absolute inset-0 flex items-center gap-[1px] px-1.5 py-1.5">
              {waveformData.map((amplitude, index) => (
                <div
                  key={index}
                  className="flex-1 bg-gradient-to-t from-primary/70 to-primary/50 rounded-sm min-w-[2px]"
                  style={{ height: `${Math.max(amplitude * 100, 12)}%` }}
                />
              ))}
            </div>
            {isPlaying && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-[0_0_6px_rgba(var(--primary),0.8)] z-10 pointer-events-none"
                style={{ left: `${playheadPercent}%` }}
              />
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No waveform</span>
        )}
      </div>
    </div>
  );
}
