import React, { forwardRef, useRef, useEffect, useImperativeHandle, useState } from 'react';
import MuxPlayer from '@mux/mux-player-react';
import Hls from 'hls.js';
import { isBunnyUrl, getBunnyHlsUrl, getBunnyMp4Url } from '@/lib/bunny-utils';

interface MuxVideoPlayerProps {
  playbackId?: string | null;
  fallbackUrl?: string;
  bunnyHlsUrl?: string | null;
  /** Bunny official embed URL (iframe) - use for playback to avoid 403 on direct CDN */
  bunnyEmbedUrl?: string | null;

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
    bunnyEmbedUrl,
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
    const [bunnyHlsFailed, setBunnyHlsFailed] = useState(false);

    // Determine if we should use Bunny HLS
    const resolvedBunnyHlsUrl =
      bunnyHlsUrl ||
      (fallbackUrl && isBunnyUrl(fallbackUrl) ? getBunnyHlsUrl(fallbackUrl) : null);
    const bunnyMp4Fallback = resolvedBunnyHlsUrl
      ? getBunnyMp4Url(resolvedBunnyHlsUrl, "720p")
      : (fallbackUrl && isBunnyUrl(fallbackUrl) ? getBunnyMp4Url(fallbackUrl, "720p") : null);

    useImperativeHandle(ref, () => {
      if (resolvedBunnyHlsUrl && bunnyVideoRef.current) {
        return bunnyVideoRef.current;
      }
      if (playbackId && muxPlayerRef.current) {
        return muxPlayerRef.current;
      }
      return fallbackVideoRef.current!;
    });

    useEffect(() => {
      setBunnyHlsFailed(false);
    }, [resolvedBunnyHlsUrl]);

    // Set up HLS.js for Bunny playback
    useEffect(() => {
      if (!resolvedBunnyHlsUrl || !bunnyVideoRef.current || bunnyHlsFailed) return;

      const video = bunnyVideoRef.current;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          startLevel: -1,
        });
        hls.loadSource(resolvedBunnyHlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.warn('[Bunny HLS] Fatal error, falling back to MP4:', data.type, data.details);
            hls.destroy();
            hlsRef.current = null;
            setBunnyHlsFailed(true);
          }
        });
        hlsRef.current = hls;

        return () => {
          hls.destroy();
          hlsRef.current = null;
        };
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = resolvedBunnyHlsUrl;
      }
    }, [resolvedBunnyHlsUrl, bunnyHlsFailed]);

    // Priority 1: Mux when ready
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

    // Priority 2: Bunny embed iframe (avoids 403 on direct CDN)
    if (bunnyEmbedUrl) {
      return (
        <iframe
          src={`${bunnyEmbedUrl}?autoplay=${autoPlay}&loop=${loop}&muted=${muted}&preload=true&responsive=true`}
          loading="lazy"
          className={className}
          style={{ border: 0, ...style }}
          allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
          allowFullScreen
          title="Video"
          data-testid={dataTestId}
          data-video-index={dataVideoIndex}
        />
      );
    }

    // Priority 3: Bunny HLS (or MP4 fallback if HLS failed)
    if (resolvedBunnyHlsUrl || (bunnyHlsFailed && bunnyMp4Fallback)) {
      return (
        <video
          ref={bunnyVideoRef}
          src={bunnyHlsFailed && bunnyMp4Fallback ? bunnyMp4Fallback : undefined}
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

    // Priority 4: Direct URL fallback
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
