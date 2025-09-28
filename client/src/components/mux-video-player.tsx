import React, { forwardRef, useRef, useImperativeHandle } from 'react';
import MuxPlayer from '@mux/mux-player-react';

interface MuxVideoPlayerProps {
  // Mux-specific props
  playbackId?: string | null;
  
  // Fallback video URL when Mux is not available
  fallbackUrl?: string;
  
  // Standard video props
  className?: string;
  style?: React.CSSProperties;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  poster?: string;
  
  // Event handlers
  onLoadStart?: () => void;
  onError?: (error: Error) => void;
  onCanPlay?: () => void;
  onLoadedData?: () => void;
  
  // Test attributes
  'data-testid'?: string;
  'data-video-index'?: number;
}

export const MuxVideoPlayer = forwardRef<HTMLVideoElement, MuxVideoPlayerProps>(
  ({
    playbackId,
    fallbackUrl,
    className,
    style,
    loop = false,
    muted = false,
    playsInline = true,
    preload = 'metadata',
    poster,
    onLoadStart,
    onError,
    onCanPlay,
    onLoadedData,
    'data-testid': dataTestId,
    'data-video-index': dataVideoIndex,
  }, ref) => {
    const muxPlayerRef = useRef<any>(null);
    const fallbackVideoRef = useRef<HTMLVideoElement>(null);

    // Expose the appropriate video element via ref
    useImperativeHandle(ref, () => {
      if (playbackId && muxPlayerRef.current) {
        return muxPlayerRef.current;
      }
      return fallbackVideoRef.current!;
    });

    // If we have a Mux playback ID, use the Mux player
    if (playbackId) {
      return (
        <MuxPlayer
          ref={muxPlayerRef}
          playbackId={playbackId}
          streamType="on-demand"
          autoPlay={false}
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

    // Fallback to regular video element
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
          data-testid={dataTestId}
          data-video-index={dataVideoIndex}
          onLoadStart={onLoadStart}
          onError={() => onError?.(new Error('Video playback failed'))}
          onCanPlay={onCanPlay}
          onLoadedData={onLoadedData}
        />
      );
    }

    // No video source available
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