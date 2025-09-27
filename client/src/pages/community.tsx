import { useState, useRef, useEffect, useMemo } from "react";
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

  // Fetch community videos with infinite query
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<CommunityResponse>({
    queryKey: ["/api/community/videos", seed],
    queryFn: async ({ pageParam }: { pageParam?: { afterHash: string; afterId: string } }) => {
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

  const currentVideo = allVideos[currentIndex];

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

  // Navigation functions
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < allVideos.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
    
    // Prefetch next page when near the end
    if (currentIndex >= allVideos.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

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
  const handleLikeToggle = () => {
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
  const handleShare = () => {
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
      
      {/* Main Feed Container */}
      <div 
        ref={feedContainerRef}
        className="h-[calc(100vh-4rem)] overflow-y-auto snap-y snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        
        {/* Render only visible videos (current, previous, next) for performance */}
        {allVideos.map((video, index) => {
          const isVisible = Math.abs(index - currentIndex) <= 1;
          const isCurrent = index === currentIndex;
          
          if (!isVisible) {
            return (
              <div 
                key={video.id} 
                className="h-screen snap-center"
                data-testid={`video-placeholder-${video.id}`}
              />
            );
          }

          return (
            <div 
              key={video.id} 
              className="h-screen snap-center relative flex items-center justify-center bg-black"
              data-testid={`community-video-${video.id}`}
            >
              {/* Video Player */}
              <div className="relative max-w-[800px] h-auto max-h-full mx-auto">
                <video
                  ref={(el) => {
                    if (el) videoRefs.current[video.id] = el;
                  }}
                  src={video.videoUrl}
                  className="w-full h-auto max-h-full object-contain"
                  loop
                  muted={isMuted}
                  playsInline
                  preload={isCurrent ? "auto" : "metadata"}
                  data-testid={`video-element-${video.id}`}
                />
                
                {/* Video Controls Overlay - Only show for current video */}
                {isCurrent && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300">
                    <div className="flex items-center gap-4">
                      {/* Play/Pause Button */}
                      <Button
                        onClick={handlePlayPauseToggle}
                        variant="ghost"
                        size="lg"
                        className="w-16 h-16 rounded-full bg-black/60 hover:bg-black/80 text-white"
                        data-testid="button-play-pause-overlay"
                      >
                        {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8" />}
                      </Button>
                    </div>
                    
                    {/* Mute Button - Bottom right corner */}
                    <div className="absolute bottom-4 right-4">
                      <Button
                        onClick={handleMuteToggle}
                        variant="ghost"
                        size="lg"
                        className="w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white"
                        data-testid="button-mute-toggle-overlay"
                      >
                        {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
                      </Button>
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
                    {/* Left side - Video info */}
                    <div className="flex-1 mr-4">
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

                    {/* Right side - Action buttons */}
                    <div className="flex flex-col gap-4">
                      <Button
                        onClick={handleLikeToggle}
                        variant="ghost"
                        size="lg"
                        className={`w-14 h-14 rounded-full ${
                          likeStatus?.liked 
                            ? 'bg-red-500 hover:bg-red-600 text-white' 
                            : 'bg-white/20 hover:bg-white/30 text-white'
                        }`}
                        data-testid="button-like-video"
                      >
                        <div className="flex flex-col items-center">
                          <ThumbsUp className="h-6 w-6" />
                          <span className="text-xs mt-1">
                            {likeStatus?.likesCount || 0}
                          </span>
                        </div>
                      </Button>

                      <Button
                        onClick={handleCommentsClick}
                        variant="ghost"
                        size="lg"
                        className="w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 text-white"
                        data-testid="button-comments-toggle"
                      >
                        <div className="flex flex-col items-center">
                          <MessageCircle className="h-6 w-6" />
                          <span className="text-xs mt-1">{comments.length}</span>
                        </div>
                      </Button>

                      <Button
                        onClick={handleShare}
                        variant="ghost"
                        size="lg"
                        className="w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 text-white"
                        data-testid="button-share-video"
                      >
                        <Share2 className="h-6 w-6" />
                      </Button>

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