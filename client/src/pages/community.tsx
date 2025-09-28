import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useInfiniteQuery, useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { MessageCircle, Heart, Share2, VolumeX, Volume2, Play, Pause, ArrowUp, ArrowDown, Trash2, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { NavigationHeader } from "@/components/navigation-header";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { checkProfanity, getCategoryMessage } from "@/lib/profanity-filter";
import { MuxVideoPlayer } from "@/components/mux-video-player";

type CommunityVideo = {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string;
  mux?: {
    playbackId: string | null;
    assetStatus: string | null;
    hlsUrl: string | null;
  };
  creator: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  isPublic: boolean;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
};

type Comment = {
  id: string;
  content: string;
  userId: string;
  username: string;
  userAvatarUrl?: string;
  createdAt: string;
  isOwn?: boolean;
};

export default function CommunityPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentProfanityCheck, setCommentProfanityCheck] = useState<{ isClean: boolean; category?: string } | null>(null);
  const [showComments, setShowComments] = useState(false);

  const feedContainerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});

  // Fetch current user
  const { data: user } = useQuery({
    queryKey: ["/api/me"],
  });

  const isAuthenticated = !!user;

  // Fetch community videos with infinite scrolling and session seed
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["/api/community/videos"],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      
      if (pageParam?.afterId) {
        params.set("afterId", pageParam.afterId);
      }
      
      if (pageParam?.seed) {
        params.set("seed", pageParam.seed);
      }
      
      const response = await fetch(`/api/community/videos?${params}`);
      if (!response.ok) throw new Error("Failed to fetch community videos");
      return response.json();
    },
    getNextPageParam: (lastPage) => 
      lastPage.pagination.hasMore 
        ? { 
            afterId: lastPage.pagination.nextAfterId,
            seed: lastPage.pagination.seed // Maintain session seed
          }
        : undefined,
    initialPageParam: undefined,
  });

  // Flatten all videos from pages
  const allVideos = useMemo(() => 
    data?.pages.flatMap(page => page.videos) || [], 
    [data]
  );

  const currentVideo = allVideos[currentIndex];

  // Fetch current video's like status
  const { data: likeStatus } = useQuery({
    queryKey: ["/api/videos", currentVideo?.id, "like"],
    enabled: !!currentVideo && isAuthenticated,
  });

  // Fetch current video's comments
  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["/api/videos", currentVideo?.id, "comments"],
    enabled: !!currentVideo,
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

  // Navigation functions
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      const container = feedContainerRef.current;
      if (container) {
        const targetIndex = currentIndex - 1;
        const videoHeight = window.innerHeight;
        container.scrollTo({
          top: targetIndex * videoHeight,
          behavior: 'smooth'
        });
        setCurrentIndex(targetIndex);
      }
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < allVideos.length - 1) {
      const container = feedContainerRef.current;
      if (container) {
        const targetIndex = currentIndex + 1;
        const videoHeight = window.innerHeight;
        container.scrollTo({
          top: targetIndex * videoHeight,
          behavior: 'smooth'
        });
        setCurrentIndex(targetIndex);
      }
    }
    
    // Prefetch next page when near the end
    if (currentIndex >= allVideos.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [currentIndex, allVideos.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

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
    e.stopPropagation();
    
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
    e.stopPropagation();
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
    e.stopPropagation();
    setIsMuted(!isMuted);
    
    const currentVideoElement = currentVideo ? videoRefs.current[currentVideo.id] : null;
    if (currentVideoElement) {
      currentVideoElement.muted = !isMuted;
    }
  };

  // Handle play/pause toggle
  const handlePlayPauseToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    e.stopPropagation();
    setShowComments(true);
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
        setIsPlaying(false);
      });
    }
  }, [currentIndex, currentVideo, isMuted, isPlaying]);

  // Reset playing state when changing videos
  useEffect(() => {
    setIsPlaying(true);
    setShowComments(false); // Close comments when switching videos
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
      
      {/* Main Feed Container */}
      <div 
        ref={feedContainerRef}
        className="h-[calc(100vh-4rem)] overflow-y-auto snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        
        {/* Render all videos */}
        {allVideos.map((video, index) => {
          const isCurrent = index === currentIndex;

          return (
            <div 
              key={video.id} 
              className="h-screen snap-center relative flex items-center justify-center bg-black"
              data-testid={`community-video-${video.id}`}
            >
              {/* Mux Video Player with fallback */}
              <div className="relative max-w-[800px] h-auto max-h-full mx-auto">
                <MuxVideoPlayer
                  ref={(el) => {
                    if (el) {
                      videoRefs.current[video.id] = el;
                    }
                  }}
                  playbackId={video.mux?.assetStatus === 'ready' ? video.mux.playbackId : null}
                  fallbackUrl={video.videoUrl}
                  className="w-full h-auto max-h-full object-contain"
                  loop
                  muted={isMuted}
                  playsInline
                  preload="metadata"
                  data-testid={`video-element-${video.id}`}
                  data-video-index={index}
                  onLoadStart={() => {
                    console.log(`Video ${index} started loading`);
                  }}
                  onError={() => {
                    console.warn(`Failed to load video ${video.id}`);
                  }}
                />
                
                {/* Video Controls Overlay - Only show for current video */}
                {isCurrent && (
                  <div className="absolute inset-0 transition-opacity duration-300 group z-20 pointer-events-none opacity-70 hover:opacity-100">
                    {/* Right Side Controls - Social Actions Only */}
                    <div className="absolute right-4 bottom-1/2 transform translate-y-1/2 flex flex-col items-center gap-4 pointer-events-auto">
                      {/* Like Button */}
                      <div className="flex flex-col items-center">
                        <Button
                          onClick={handleLikeToggle}
                          variant="ghost"
                          size="sm"
                          className="text-white hover:bg-black/50 border-0 p-3 rounded-full bg-black/30 backdrop-blur-sm"
                          data-testid="button-like"
                        >
                          <Heart 
                            size={24} 
                            className={likeStatus?.liked ? "fill-red-500 text-red-500" : "text-white"} 
                          />
                        </Button>
                        <span className="text-xs text-white font-semibold mt-1">
                          {(video.likesCount || 0) + (likeStatus?.liked && !likeStatus.initialLiked ? 1 : 0)}
                        </span>
                      </div>

                      {/* Comments Button */}
                      <div className="flex flex-col items-center">
                        <Button
                          onClick={handleCommentsClick}
                          variant="ghost"
                          size="sm"
                          className="text-white hover:bg-black/50 border-0 p-3 rounded-full bg-black/30 backdrop-blur-sm"
                          data-testid="button-comments"
                        >
                          <MessageCircle size={24} />
                        </Button>
                        <span className="text-xs text-white font-semibold mt-1">{video.commentsCount || 0}</span>
                      </div>

                      {/* Share Button */}
                      <Button
                        onClick={handleShare}
                        variant="ghost"
                        size="sm"
                        className="text-white hover:bg-black/50 border-0 p-3 rounded-full bg-black/30 backdrop-blur-sm"
                        data-testid="button-share"
                      >
                        <Share2 size={24} />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Navigation Arrows - Only show for current video */}
                {isCurrent && (
                  <>
                    {currentIndex > 0 && (
                      <Button
                        onClick={goToPrevious}
                        variant="ghost"
                        size="sm"
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-12 h-12 z-30"
                        data-testid="button-previous"
                      >
                        <ArrowUp size={20} />
                      </Button>
                    )}
                    
                    {currentIndex < allVideos.length - 1 && (
                      <Button
                        onClick={goToNext}
                        variant="ghost"
                        size="sm"
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-12 h-12 z-30"
                        data-testid="button-next"
                      >
                        <ArrowDown size={20} />
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Video Info Overlay - Left Side */}
              {isCurrent && (
                <div className="absolute left-4 bottom-20 text-white max-w-xs z-20">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {video.creator.avatarUrl ? (
                        <img
                          src={video.creator.avatarUrl}
                          alt={video.creator.username}
                          className="w-8 h-8 rounded-full"
                          data-testid={`img-creator-avatar-${video.id}`}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                          <User size={16} />
                        </div>
                      )}
                      <span className="font-semibold text-sm" data-testid={`text-creator-${video.id}`}>
                        @{video.creator.username}
                      </span>
                    </div>
                    
                    <h3 className="font-medium text-sm leading-tight" data-testid={`text-title-${video.id}`}>
                      {video.title}
                    </h3>
                    
                    <p className="text-xs text-white/70" data-testid={`text-timestamp-${video.id}`}>
                      {formatDistanceToNow(new Date(video.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Comments Section */}
      {currentVideo && showComments && (
        <div className="fixed inset-x-0 bottom-0 bg-background border-t max-h-96 overflow-hidden z-40">
          <div className="p-4" data-testid="comments-section">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Comments ({comments.length})</h3>
                <Button
                  onClick={() => setShowComments(false)}
                  variant="ghost"
                  size="sm"
                  data-testid="button-close-comments"
                >
                  ✕
                </Button>
              </div>

              {/* Add Comment */}
              {isAuthenticated && (
                <div className="mb-4">
                  <div className="flex gap-2">
                    <Input
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      className="flex-1"
                      data-testid="input-comment"
                    />
                    <Button
                      onClick={handleCommentSubmit}
                      disabled={isSubmittingComment || !newComment.trim()}
                      data-testid="button-submit-comment"
                    >
                      {isSubmittingComment ? "Posting..." : "Post"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Comments List */}
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3" data-testid={`comment-${comment.id}`}>
                    {comment.userAvatarUrl ? (
                      <img
                        src={comment.userAvatarUrl}
                        alt={comment.username}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                        data-testid={`img-commenter-avatar-${comment.id}`}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <User size={16} />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm" data-testid={`text-commenter-${comment.id}`}>
                          {comment.username}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground" data-testid={`text-comment-time-${comment.id}`}>
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                          </span>
                          {comment.isOwn && (
                            <Button
                              onClick={() => deleteCommentMutation.mutate(comment.id)}
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              data-testid={`button-delete-comment-${comment.id}`}
                            >
                              <Trash2 size={12} />
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1" data-testid={`text-comment-content-${comment.id}`}>
                        {comment.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}