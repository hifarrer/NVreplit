import React, { useRef, useEffect, useState, forwardRef } from 'react';
import Hls from 'hls.js';

interface IntelligentVideoPlayerProps {
  // Video source URLs
  hlsUrl?: string; // Mux HLS URL (preferred)
  fallbackUrl: string; // Original video URL (fallback)
  
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

export const IntelligentVideoPlayer = forwardRef<HTMLVideoElement, IntelligentVideoPlayerProps>(
  ({
    hlsUrl,
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
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const [currentSource, setCurrentSource] = useState<'hls' | 'fallback' | null>(null);
    const [isHlsSupported, setIsHlsSupported] = useState(false);

    // Expose video element via ref
    React.useImperativeHandle(ref, () => videoRef.current!);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      // Check HLS support
      const hlsSupported = Hls.isSupported();
      setIsHlsSupported(hlsSupported);

      // If we have an HLS URL and HLS is supported, try to use it
      if (hlsUrl && hlsSupported) {
        try {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 90,
            maxBufferLength: 30,
            maxMaxBufferLength: 600,
          });

          hlsRef.current = hls;
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setCurrentSource('hls');
            onCanPlay?.();
          });

          hls.on(Hls.Events.ERROR, (event, data) => {
            console.warn('HLS error, falling back to regular video:', data);
            
            if (data.fatal) {
              // Fatal error - fall back to regular video
              hls.destroy();
              hlsRef.current = null;
              video.src = fallbackUrl;
              setCurrentSource('fallback');
              onError?.(new Error(`HLS playback failed: ${data.details}`));
            }
          });

          return;
        } catch (error) {
          console.warn('Failed to initialize HLS, using fallback:', error);
        }
      } 
      
      // Native HLS support (Safari) or fallback to regular video
      if (hlsUrl && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        setCurrentSource('hls');
      } else {
        video.src = fallbackUrl;
        setCurrentSource('fallback');
      }

      // Cleanup function
      return () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    }, [hlsUrl, fallbackUrl, onCanPlay, onError]);

    // Handle video events
    const handleLoadStart = () => {
      onLoadStart?.();
    };

    const handleError = () => {
      // If HLS fails, try fallback
      if (currentSource === 'hls' && hlsUrl) {
        console.warn('HLS video failed, falling back to regular video');
        const video = videoRef.current;
        if (video) {
          if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
          }
          video.src = fallbackUrl;
          setCurrentSource('fallback');
        }
      } else {
        onError?.(new Error('Video playback failed'));
      }
    };

    const handleLoadedData = () => {
      onLoadedData?.();
    };

    const handleCanPlay = () => {
      onCanPlay?.();
    };

    return (
      <video
        ref={videoRef}
        className={className}
        style={style}
        loop={loop}
        muted={muted}
        playsInline={playsInline}
        preload={preload}
        poster={poster}
        data-testid={dataTestId}
        data-video-index={dataVideoIndex}
        data-source={currentSource}
        onLoadStart={handleLoadStart}
        onError={handleError}
        onLoadedData={handleLoadedData}
        onCanPlay={handleCanPlay}
      />
    );
  }
);

IntelligentVideoPlayer.displayName = 'IntelligentVideoPlayer';