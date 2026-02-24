import React, { forwardRef, useRef, useEffect, useImperativeHandle } from 'react';
import MuxPlayer from '@mux/mux-player-react';
import Hls from 'hls.js';
import { isBunnyUrl, getBunnyHlsUrl } from '@/lib/bunny-utils';

interface MuxVideoPlayerProps {
  playbackId?: string | null;
  fallbackUrl?: string;
  bunnyHlsUrl?: string | null;

  className?: string;
  style?: React.CSSProperties;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  poster?: string;
  autoPlay?: boolean;
  controls?: boolean;

  onLoadStart?: () => void;
  onError?: (error: Error) => void;
  onCanPlay?: () => void;
  onLoadedData?: () => void;

  'data-testid'?: string;
  'data-video-index'?: number;
}

export const MuxVideoPlayer = forwardRef<HTMLVideoElement, MuxVideoPlayerProps>(
  ({
    playbackId,
    fallbackUrl,
    bunnyHlsUrl,
    className,
    style,
    loop = false,
    muted = false,
    playsInline = true,
    preload = 'metadata',
    poster,
    autoPlay = false,
    controls = false,
    onLoadStart,
    onError,
    onCanPlay,
    onLoadedData,
    'data-testid': dataTestId,
    'data-video-index': dataVideoIndex,
  }, ref) => {
    const muxPlayerRef = useRef<any>(null);
    const fallbackVideoRef = useRef<HTMLVideoElement>(null);
    const bunnyVideoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);

    // Determine if we should use Bunny HLS
    const resolvedBunnyHlsUrl =
      bunnyHlsUrl ||
      (fallbackUrl && isBunnyUrl(fallbackUrl) ? getBunnyHlsUrl(fallbackUrl) : null);

    useImperativeHandle(ref, () => {
      if (resolvedBunnyHlsUrl && bunnyVideoRef.current) {
        return bunnyVideoRef.current;
      }
      if (playbackId && muxPlayerRef.current) {
        return muxPlayerRef.current;
      }
      return fallbackVideoRef.current!;
    });

    // Set up HLS.js for Bunny playback
    useEffect(() => {
      if (!resolvedBunnyHlsUrl || !bunnyVideoRef.current) return;

      const video = bunnyVideoRef.current;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          startLevel: -1, // auto quality
        });
        hls.loadSource(resolvedBunnyHlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.error('[Bunny HLS] Fatal error:', data.type, data.details);
            onError?.(new Error(`HLS playback error: ${data.details}`));
            hls.destroy();
          }
        });
        hlsRef.current = hls;

        return () => {
          hls.destroy();
          hlsRef.current = null;
        };
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS support
        video.src = resolvedBunnyHlsUrl;
      }
    }, [resolvedBunnyHlsUrl, onError]);

    // Priority 1: Bunny HLS
    if (resolvedBunnyHlsUrl) {
      return (
        <video
          ref={bunnyVideoRef}
          className={className}
          style={style}
          loop={loop}
          muted={muted}
          playsInline={playsInline}
          preload={preload}
          poster={poster}
          autoPlay={autoPlay}
          controls={controls}
          data-testid={dataTestId}
          data-video-index={dataVideoIndex}
          onLoadStart={onLoadStart}
          onError={() => onError?.(new Error('Bunny video playback failed'))}
          onCanPlay={onCanPlay}
          onLoadedData={onLoadedData}
        />
      );
    }

    // Priority 2: Mux HLS
    if (playbackId) {
      return (
        <MuxPlayer
          ref={muxPlayerRef}
          playbackId={playbackId}
          streamType="on-demand"
          autoPlay={autoPlay}
          controls={controls}
          loop={loop}
          muted={muted}
          playsInline={playsInline}
          preload={preload}
          poster={poster}
          className={className}
          style={style}
          data-testid={dataTestId}
          data-video-index={dataVideoIndex}
          onLoadStart={onLoadStart}
          onError={(error: any) => onError?.(new Error(error.message || 'Mux playback error'))}
          onCanPlay={onCanPlay}
          onLoadedData={onLoadedData}
        />
      );
    }

    // Priority 3: Direct URL fallback
    if (fallbackUrl) {
      return (
        <video
          ref={fallbackVideoRef}
          src={fallbackUrl}
          className={className}
          style={style}
          loop={loop}
          muted={muted}
          playsInline={playsInline}
          preload={preload}
          poster={poster}
          autoPlay={autoPlay}
          controls={controls}
          data-testid={dataTestId}
          data-video-index={dataVideoIndex}
          onLoadStart={onLoadStart}
          onError={() => onError?.(new Error('Video playback failed'))}
          onCanPlay={onCanPlay}
          onLoadedData={onLoadedData}
        />
      );
    }

    return (
      <div 
        className={`${className} flex items-center justify-center bg-gray-900 text-white`}
        style={style}
        data-testid={dataTestId}
      >
        <p>No video available</p>
      </div>
    );
  }
);

MuxVideoPlayer.displayName = 'MuxVideoPlayer';
