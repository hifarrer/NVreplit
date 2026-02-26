import React, { forwardRef, useRef, useImperativeHandle } from 'react';
import MuxPlayer from '@mux/mux-player-react';

interface MuxVideoPlayerProps {
  playbackId?: string | null;
  fallbackUrl?: string;
  /** Direct Bunny Storage MP4 URL for immediate playback when Mux is not ready */
  bunnyStorageUrl?: string | null;

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

const muxPlayerStyle: React.CSSProperties = {
  '--media-object-fit': 'contain',
  '--media-object-position': 'center',
} as React.CSSProperties;

export const MuxVideoPlayer = forwardRef<HTMLVideoElement, MuxVideoPlayerProps>(
  ({
    playbackId,
    fallbackUrl,
    bunnyStorageUrl,
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

    useImperativeHandle(ref, () => {
      if (playbackId && muxPlayerRef.current) {
        return muxPlayerRef.current;
      }
      return fallbackVideoRef.current!;
    });

    const mergedStyle = { ...muxPlayerStyle, ...style };

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
          style={mergedStyle}
          data-testid={dataTestId}
          data-video-index={dataVideoIndex}
          onLoadStart={onLoadStart}
          onError={(error: any) => onError?.(new Error(error.message || 'Mux playback error'))}
          onCanPlay={onCanPlay}
          onLoadedData={onLoadedData}
        />
      );
    }

    // Priority 2: Bunny Storage direct MP4 URL
    const directUrl = bunnyStorageUrl || fallbackUrl;
    if (directUrl) {
      return (
        <video
          ref={fallbackVideoRef}
          src={directUrl}
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
