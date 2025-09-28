import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight, 
  ThumbsUp, 
  MessageCircle, 
  User, 
  Share2, 
  Send,
  Trash2,
  ChevronUp,
  ChevronDown,
  Volume2,
  VolumeX
} from "lucide-react";
import { Link } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { checkProfanity, getCategoryMessage, type ProfanityCheckResult } from "@/lib/profanity-filter";
import { NavigationHeader } from "@/components/navigation-header";

interface CommunityVideo {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
  duration: number;
  hash: string;
  creator: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

interface CommunityResponse {
  videos: CommunityVideo[];
  pagination: {
    hasMore: boolean;
    nextAfterHash: string | null;
    nextAfterId: string | null;
  };
}

interface LikeStatus {
  liked: boolean;
  likesCount: number;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

export default function CommunityPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAuthenticated = !!user;
  
  // Generate seed once per session for stable randomization
  const seed = useMemo(() => Math.random().toString(36).substring(7), []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentProfanityCheck, setCommentProfanityCheck] = useState<ProfanityCheckResult | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);

  const feedContainerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const [loadedVideoIndices, setLoadedVideoIndices] = useState<Set<number>>(new Set([0])); // Track which videos are loaded
  
  // Performance optimization: only render videos within a window
  const RENDER_WINDOW = 2; // Render current +/- 2 videos
  const PRELOAD_WINDOW = 1; // Preload current +/- 1 video

  // Fetch community videos with infinite query
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<CommunityResponse>({
    queryKey: ["/api/community/videos", seed],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ seed, limit: "20" });
      
      // First, check total video count to decide whether to exclude user's videos
      const totalResponse = await fetch(`/api/community/videos?seed=${seed}&limit=1`);
      const totalData = await totalResponse.json();
      const hasEnoughVideos = totalData.videos.length > 0; // For demo, always show user's videos
      
      // Don't exclude user's own videos in demo/development scenarios
      // if (user?.id && hasEnoughVideos) params.append("excludeUserId", user.id);
      
      if (pageParam) {
        params.append("afterHash", pageParam.afterHash);
        params.append("afterId", pageParam.afterId);
      }
      
      const response = await fetch(`/api/community/videos?${params}`);
      if (!response.ok) throw new Error("Failed to fetch community videos");
      return response.json();
    },
    getNextPageParam: (lastPage) => 
      lastPage.pagination.hasMore 
        ? { 
            afterHash: lastPage.pagination.nextAfterHash, 
            afterId: lastPage.pagination.nextAfterId 
          }
        : undefined,
    initialPageParam: undefined,
  });

  // Flatten all videos from pages
  const allVideos = useMemo(() => 
    data?.pages.flatMap(page => page.videos) || [], 
    [data]
  );
  
  // Get indices of videos to render for performance
  const renderIndices = useMemo(() => {
    const indices = new Set<number>();
    const start = Math.max(0, currentIndex - RENDER_WINDOW);
    const end = Math.min(allVideos.length - 1, currentIndex + RENDER_WINDOW);
    
    for (let i = start; i <= end; i++) {
      indices.add(i);
    }
    return indices;
  }, [currentIndex, allVideos.length]);
  
  // Video cleanup function
  const cleanupVideo = useCallback((videoId: string) => {
    const video = videoRefs.current[videoId];
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load(); // This will free up memory
      delete videoRefs.current[videoId];
    }
  }, []);
  
  // Cleanup videos outside render window
  const cleanupOutsideVideos = useCallback(() => {
    Object.keys(videoRefs.current).forEach(videoId => {
      const videoIndex = allVideos.findIndex(v => v.id === videoId);
      if (videoIndex !== -1 && !renderIndices.has(videoIndex)) {
        cleanupVideo(videoId);
      }
    });
  }, [allVideos, renderIndices, cleanupVideo]);
  
  // Smart video preloading
  const shouldPreloadVideo = useCallback((index: number) => {
    return Math.abs(index - currentIndex) <= PRELOAD_WINDOW;
  }, [currentIndex]);

  const currentVideo = allVideos[currentIndex];
  
  // Setup intersection observer for performance
  useEffect(() => {
    if (!feedContainerRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const videoIndex = parseInt(entry.target.getAttribute('data-video-index') || '0');
          
          if (entry.isIntersecting) {
            // Video is visible, ensure it's loaded
            setLoadedVideoIndices(prev => new Set([...prev, videoIndex]));
          } else {
            // Video is not visible, consider unloading if far away
            if (Math.abs(videoIndex - currentIndex) > RENDER_WINDOW) {
              setLoadedVideoIndices(prev => {
                const newSet = new Set(prev);
                newSet.delete(videoIndex);
                return newSet;
              });
            }
          }
        });
      },
      {
        root: feedContainerRef.current,
        threshold: 0.1,
        rootMargin: '100px'
      }
    );
    
    intersectionObserverRef.current = observer;
    
    return () => {
      observer.disconnect();
      intersectionObserverRef.current = null;
    };
  }, [currentIndex]);
  
  // Video playback management
  useEffect(() => {
    if (!currentVideo) return;
    
    const currentVideoElement = videoRefs.current[currentVideo.id];
    if (currentVideoElement) {
      // Ensure current video is properly loaded and playing
      const playVideo = async () => {
        try {
          if (isPlaying) {
            await currentVideoElement.play();
          } else {
            currentVideoElement.pause();
          }
        } catch (error) {
          console.warn('Video play/pause failed:', error);
        }
      };
      
      playVideo();
    }
    
    // Pause all other videos for performance
    Object.entries(videoRefs.current).forEach(([videoId, videoElement]) => {
      if (videoId !== currentVideo.id && videoElement) {
        videoElement.pause();
      }
    });
  }, [currentVideo, isPlaying]);
  
  // Debounced scroll handling for performance
  const [scrollTimeout, setScrollTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const handleScroll = useCallback(() => {
    // Clear existing timeout
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    
    // Debounce scroll handling
    const timeout = setTimeout(() => {
      cleanupOutsideVideos();
    }, 150);
    
    setScrollTimeout(timeout);
  }, [scrollTimeout, cleanupOutsideVideos]);
  
  // Setup scroll event listener with debouncing
  useEffect(() => {
    const container = feedContainerRef.current;
    if (!container) return;
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [handleScroll, scrollTimeout]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up all video references on unmount
      Object.keys(videoRefs.current).forEach(videoId => {
        cleanupVideo(videoId);
      });
      
      // Disconnect intersection observer
      if (intersectionObserverRef.current) {
        intersectionObserverRef.current.disconnect();
      }
      
      // Clear any pending timeouts
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [cleanupVideo, scrollTimeout]);

  // Get like status for current video
  const { data: likeStatus } = useQuery<LikeStatus>({
    queryKey: ["/api/videos", currentVideo?.id, "like"],
    enabled: isAuthenticated && !!currentVideo,
    retry: false,
  });

  // Get comments for current video only
  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["/api/videos", currentVideo?.id, "comments"],
    enabled: !!currentVideo,
    retry: false,
  });

  // Like/Unlike mutations
  const likeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/videos/${currentVideo.id}/like`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos", currentVideo.id, "like"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to like video",
        variant: "destructive",
      });
    },
  });

  const unlikeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/videos/${currentVideo.id}/like`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos", currentVideo.id, "like"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unlike video",
        variant: "destructive",
      });
    },
  });

  // Comment mutations
  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest("POST", `/api/videos/${currentVideo.id}/comments`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos", currentVideo.id, "comments"] });
      setNewComment("");
      setIsSubmittingComment(false);
      setCommentProfanityCheck(null);
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
    },
    onError: (error: any) => {
      setIsSubmittingComment(false);
      toast({
        title: "Error",
        description: error.message || "Failed to add comment",
        variant: "destructive",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return await apiRequest("DELETE", `/api/videos/${currentVideo.id}/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos", currentVideo.id, "comments"] });
      toast({
        title: "Success",
        description: "Comment deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete comment",
        variant: "destructive",
      });
    },
  });

  // Navigation functions with cleanup
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => {
        const newIndex = prev - 1;
        // Cleanup videos outside render window after navigation
        setTimeout(cleanupOutsideVideos, 100);
        return newIndex;
      });
    }
  }, [currentIndex, cleanupOutsideVideos]);

  const goToNext = useCallback(() => {
    if (currentIndex < allVideos.length - 1) {
      setCurrentIndex(prev => {
        const newIndex = prev + 1;
        // Cleanup videos outside render window after navigation
        setTimeout(cleanupOutsideVideos, 100);
        return newIndex;
      });
    }
    
    // Prefetch next page when near the end
    if (currentIndex >= allVideos.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [currentIndex, allVideos.length, cleanupOutsideVideos, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Scroll to current video
  const scrollToVideo = (index: number) => {
    const container = feedContainerRef.current;
    if (container) {
      const videoHeight = window.innerHeight;
      container.scrollTo({
        top: index * videoHeight,
        behavior: "smooth",
      });
    }
  };

  // Handle like toggle
  const handleLikeToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    
    // Prevent multiple clicks while mutations are pending
    if (likeMutation.isPending || unlikeMutation.isPending) {
      return;
    }
    
    if (!isAuthenticated) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like videos",
        variant: "destructive",
      });
      return;
    }

    const isLiked = likeStatus?.liked;
    if (isLiked) {
      unlikeMutation.mutate();
    } else {
      likeMutation.mutate();
    }
  };

  // Handle comment submit
  const handleCommentSubmit = () => {
    if (!isAuthenticated) {
      toast({
        title: "Sign in required",
        description: "Please sign in to comment",
        variant: "destructive",
      });
      return;
    }

    const trimmedComment = newComment.trim();
    if (!trimmedComment) {
      toast({
        title: "Error",
        description: "Please enter a comment",
        variant: "destructive",
      });
      return;
    }

    // Check for profanity
    const profanityCheck = checkProfanity(trimmedComment);
    if (!profanityCheck.isClean) {
      toast({
        title: "Content not allowed",
        description: getCategoryMessage(profanityCheck.category || ""),
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingComment(true);
    addCommentMutation.mutate(trimmedComment);
  };

  // Handle share
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    if (!currentVideo) return;
    
    const shareUrl = `${window.location.origin}/v/${currentVideo.id}`;
    
    if (navigator.share) {
      navigator.share({
        title: currentVideo.title,
        text: `Check out this video by @${currentVideo.creator.username}`,
        url: shareUrl,
      });
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link copied!",
        description: "Video link has been copied to clipboard",
      });
    }
  };

  // Handle mute toggle
  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    setIsMuted(!isMuted);
    
    // Update current video element immediately
    const currentVideoElement = currentVideo ? videoRefs.current[currentVideo.id] : null;
    if (currentVideoElement) {
      currentVideoElement.muted = !isMuted;
    }
  };

  // Handle play/pause toggle
  const handlePlayPauseToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    const currentVideoElement = currentVideo ? videoRefs.current[currentVideo.id] : null;
    if (currentVideoElement) {
      if (isPlaying) {
        currentVideoElement.pause();
        setIsPlaying(false);
      } else {
        currentVideoElement.play().catch(() => {
          // Handle play failure silently
        });
        setIsPlaying(true);
      }
    }
  };

  // Handle comments button click
  const handleCommentsClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    // Scroll to comments section
    const commentsSection = document.querySelector('[data-testid="comments-section"]');
    if (commentsSection) {
      commentsSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Auto-play/pause video management
  useEffect(() => {
    const currentVideoElement = currentVideo ? videoRefs.current[currentVideo.id] : null;
    
    // Pause all videos first
    Object.values(videoRefs.current).forEach(video => {
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
    });

    // Play current video if isPlaying is true
    if (currentVideoElement && isPlaying) {
      currentVideoElement.muted = isMuted;
      currentVideoElement.play().catch(() => {
        // Handle autoplay failure silently
        setIsPlaying(false);
      });
    }
  }, [currentIndex, currentVideo, isMuted, isPlaying]);

  // Reset playing state when changing videos
  useEffect(() => {
    setIsPlaying(true);
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, allVideos.length]);

  // Scroll handler for snap-to-video behavior
  useEffect(() => {
    const container = feedContainerRef.current;
    if (!container) return;

    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const scrollTop = container.scrollTop;
        const videoHeight = window.innerHeight;
        const newIndex = Math.round(scrollTop / videoHeight);
        
        if (newIndex !== currentIndex && newIndex >= 0 && newIndex < allVideos.length) {
          setCurrentIndex(newIndex);
        }
      }, 150);
    };

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [currentIndex, allVideos.length]);

  // Update scroll position when index changes
  useEffect(() => {
    scrollToVideo(currentIndex);
  }, [currentIndex]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading community videos...</p>
        </div>
      </div>
    );
  }

  if (!allVideos.length) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <MessageCircle className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-xl font-semibold mb-2">No videos yet</p>
            <p className="text-muted-foreground">Be the first to create and share a video!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      {/* Main Feed Container with hardware acceleration */}
      <div 
        ref={feedContainerRef}
        className="h-[calc(100vh-4rem)] overflow-y-auto snap-y snap-mandatory scroll-smooth"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          transform: 'translateZ(0)', // Hardware acceleration
          willChange: 'scroll-position' // Optimization hint
        }}
      >
        <style>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        
        {/* Render optimized video window for performance */}
        {allVideos.map((video, index) => {
          const shouldRender = renderIndices.has(index);
          const isCurrent = index === currentIndex;
          const shouldLoad = shouldPreloadVideo(index) || loadedVideoIndices.has(index);
          
          // Always render placeholder for scroll positioning
          if (!shouldRender) {
            return (
              <div 
                key={video.id} 
                className="h-screen snap-center bg-black"
                data-video-index={index}
                data-testid={`video-placeholder-${video.id}`}
                ref={(el) => {
                  if (el && intersectionObserverRef.current) {
                    intersectionObserverRef.current.observe(el);
                  }
                }}
              >
                {/* Loading skeleton for better UX */}
                <div className="flex items-center justify-center h-full">
                  <div className="animate-pulse bg-gray-800 w-full max-w-[800px] aspect-video rounded-lg" />
                </div>
              </div>
            );
          }

          return (
            <div 
              key={video.id} 
              className="h-screen snap-center relative flex items-center justify-center bg-black"
              data-testid={`community-video-${video.id}`}
            >
              {/* Video Player with hardware acceleration */}
              <div 
                className="relative max-w-[800px] h-auto max-h-full mx-auto"
                style={{ transform: 'translateZ(0)' }} // Force hardware acceleration
              >
                <video
                  ref={(el) => {
                    if (el) {
                      videoRefs.current[video.id] = el;
                      // Observe video element for intersection
                      if (intersectionObserverRef.current) {
                        intersectionObserverRef.current.observe(el);
                      }
                    }
                  }}
                  src={shouldLoad ? video.videoUrl : undefined}
                  className="w-full h-auto max-h-full object-contain"
                  style={{ willChange: 'transform' }} // Hint for hardware acceleration
                  loop
                  muted={isMuted}
                  playsInline
                  preload={shouldLoad ? (isCurrent ? "auto" : "metadata") : "none"}
                  data-testid={`video-element-${video.id}`}
                  data-video-index={index}
                  onLoadStart={() => {
                    // Video started loading, ensure it's in loaded set
                    setLoadedVideoIndices(prev => new Set([...Array.from(prev), index]));
                  }}
                  onError={() => {
                    console.warn(`Failed to load video ${video.id}`);
                  }}
                />
                
                {/* Video Controls Overlay - Only show for current video */}
                {isCurrent && (
                  <div className={`absolute inset-0 transition-opacity duration-300 group z-20 pointer-events-none ${
                    !isPlaying ? 'opacity-100' : 'opacity-0 hover:opacity-100'
                  }`}>
                    {/* Play/Pause Button - Center */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
                      <Button
                        onClick={handlePlayPauseToggle}
                        variant="ghost"
                        size="lg"
                        className="w-16 h-16 rounded-full bg-black/60 hover:bg-black/80 text-white pointer-events-auto"
                        data-testid="button-play-pause-overlay"
                      >
                        {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8" />}
                      </Button>
                    </div>
                    
                    {/* Mute Button - Top right corner */}
                    <div className="absolute top-4 right-4 pointer-events-auto">
                      <Button
                        onClick={handleMuteToggle}
                        variant="ghost"
                        size="lg"
                        className="w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white pointer-events-auto"
                        data-testid="button-mute-toggle-overlay"
                      >
                        {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
                      </Button>
                    </div>
                    
                    {/* Action Buttons - Bottom center */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
                      <div className="flex items-center gap-4">
                        <Button
                          onClick={handleLikeToggle}
                          variant="ghost"
                          size="sm"
                          className={`flex items-center gap-2 rounded-full px-4 py-2 ${likeStatus?.liked 
                            ? 'bg-red-500 hover:bg-red-600 text-white' 
                            : 'bg-black/60 hover:bg-black/80 text-white'} pointer-events-auto`}
                          data-testid="button-like-video-overlay"
                        >
                          <ThumbsUp className="h-4 w-4" />
                          <span className="text-sm">{likeStatus?.likesCount || 0}</span>
                        </Button>

                        <Button
                          onClick={handleCommentsClick}
                          variant="ghost"
                          size="sm"
                          className="flex items-center gap-2 rounded-full px-4 py-2 bg-black/60 hover:bg-black/80 text-white pointer-events-auto"
                          data-testid="button-comments-toggle-overlay"
                        >
                          <MessageCircle className="h-4 w-4" />
                          <span className="text-sm">{comments.length}</span>
                        </Button>

                        <Button
                          onClick={handleShare}
                          variant="ghost"
                          size="sm"
                          className="flex items-center gap-2 rounded-full px-4 py-2 bg-black/60 hover:bg-black/80 text-white pointer-events-auto"
                          data-testid="button-share-video-overlay"
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation Arrows */}
              {currentIndex > 0 && (
                <Button
                  onClick={goToPrevious}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 hover:bg-black/70 border-0"
                  data-testid="button-previous-video"
                >
                  <ChevronUp className="h-6 w-6 text-white" />
                </Button>
              )}
              
              {currentIndex < allVideos.length - 1 && (
                <Button
                  onClick={goToNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 hover:bg-black/70 border-0"
                  data-testid="button-next-video"
                >
                  <ChevronDown className="h-6 w-6 text-white" />
                </Button>
              )}

              {/* Video Info Overlay - Only show for current video */}
              {isCurrent && (
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                  <div className="flex items-end justify-between">
                    {/* Video info */}
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-white mb-2 line-clamp-2">
                        {video.title}
                      </h2>
                      
                      <div className="flex items-center mb-4">
                        <Avatar className="h-10 w-10 mr-3 border-2 border-white/20">
                          <AvatarImage src={video.creator.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary text-white">
                            {video.creator.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div>
                          <Link href={`/u/${video.creator.username}`}>
                            <span className="text-white font-semibold hover:underline cursor-pointer">
                              @{video.creator.username}
                            </span>
                          </Link>
                          <p className="text-white/80 text-sm">
                            {formatDistanceToNow(new Date(video.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Comments Section */}
                  <div className="mt-6 max-h-60 overflow-y-auto" data-testid="comments-section">
                    {comments.length > 0 && (
                      <div className="space-y-3 mb-4">
                        {comments.slice(0, 3).map((comment) => (
                          <div key={comment.id} className="flex items-start gap-3">
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              <AvatarImage src={comment.user.avatarUrl || undefined} />
                              <AvatarFallback className="bg-primary text-white">
                                {comment.user.username.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            
                            <div className="flex-1 min-w-0">
                              <div className="bg-white/10 rounded-lg px-3 py-2">
                                <p className="text-white/90 text-sm font-medium mb-1">
                                  @{comment.user.username}
                                </p>
                                <p className="text-white text-sm">{comment.content}</p>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-white/60 text-xs">
                                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                                </span>
                                {isAuthenticated && comment.user.id === user?.id && (
                                  <Button
                                    onClick={() => deleteCommentMutation.mutate(comment.id)}
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-white/60 hover:text-red-400"
                                    data-testid={`button-delete-comment-${comment.id}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Comment */}
                    {isAuthenticated && (
                      <div className="flex gap-2">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage src={user?.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary text-white">
                            {(user?.username || 'U').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 flex gap-2">
                          <Textarea
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Add a comment..."
                            className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/60 resize-none"
                            rows={1}
                            disabled={isSubmittingComment}
                            data-testid="textarea-comment"
                          />
                          <Button
                            onClick={handleCommentSubmit}
                            disabled={!newComment.trim() || isSubmittingComment}
                            className="self-end"
                            data-testid="button-submit-comment"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {!isAuthenticated && (
                      <div className="text-center">
                        <p className="text-white/60 text-sm">
                          <Link href="/auth">
                            <span className="text-primary hover:underline cursor-pointer">
                              Sign in
                            </span>
                          </Link>{" "}
                          to like and comment
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}