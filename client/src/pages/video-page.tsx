import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Share2, User, ThumbsUp, MessageCircle, Trash2, Send, Gift } from "lucide-react";
import { SendGreetingCardModal } from "@/components/modals/send-greeting-card-modal";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { checkProfanity, getCategoryMessage, type ProfanityCheckResult } from "@/lib/profanity-filter";
import { MuxVideoPlayer } from "@/components/mux-video-player";
import logoImage from "@assets/neonlogo_1756693683433.png";
import { convertAvatarUrlToImageKit } from "@/lib/utils";

interface VideoData {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
  duration: number;
  likesCount: number;
  aspectRatio?: string;
  mux?: {
    playbackId: string | null;
    assetStatus: string | null;
  };
  bunny?: {
    videoId: string | null;
    status: string | null;
    hlsUrl: string | null;
    thumbnailUrl: string | null;
  };
  creator: {
    id: string;
    username: string;
    avatarUrl: string | null;
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

export default function VideoPage() {
  const params = useParams();
  const videoId = params.videoId as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentProfanityCheck, setCommentProfanityCheck] = useState<ProfanityCheckResult | null>(null);
  const [showGreetingCardModal, setShowGreetingCardModal] = useState(false);
  const { user } = useAuth();
  const isAuthenticated = !!user;

  const { data: video, isLoading, error } = useQuery<VideoData>({
    queryKey: ['/api/videos', videoId],
    retry: false
  });

  // Get like status for authenticated users
  const { data: likeStatus } = useQuery<LikeStatus>({
    queryKey: ['/api/videos', videoId, 'like'],
    enabled: isAuthenticated,
    retry: false
  });

  // Get comments for the video
  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ['/api/videos', videoId, 'comments'],
    retry: false
  });

  // Like mutation
  const likeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/videos/${videoId}/like`);
    },
    onSuccess: () => {
      // Invalidate both the video data and like status
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId] });
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId, 'like'] });
      toast({
        title: "Liked!",
        description: "You liked this video"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to like video",
        variant: "destructive"
      });
    }
  });

  // Unlike mutation
  const unlikeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/videos/${videoId}/like`);
    },
    onSuccess: () => {
      // Invalidate both the video data and like status
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId] });
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId, 'like'] });
      toast({
        title: "Unliked",
        description: "You unliked this video"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unlike video",
        variant: "destructive"
      });
    }
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest('POST', `/api/videos/${videoId}/comments`, { content });
      if (!response.ok) {
        throw new Error('Failed to add comment');
      }
      return response.json();
    },
    onSuccess: () => {
      setNewComment("");
      setIsSubmittingComment(false);
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId, 'comments'] });
      toast({
        title: "Success",
        description: "Comment added successfully"
      });
    },
    onError: (error: any) => {
      setIsSubmittingComment(false);
      toast({
        title: "Error",
        description: error.message || "Failed to add comment",
        variant: "destructive"
      });
    }
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return await apiRequest('DELETE', `/api/videos/${videoId}/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId, 'comments'] });
      toast({
        title: "Success",
        description: "Comment deleted successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete comment",
        variant: "destructive"
      });
    }
  });


  const handleLikeToggle = () => {
    if (!isAuthenticated) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like videos",
        variant: "destructive"
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

  const handleCommentSubmit = () => {
    if (!isAuthenticated) {
      toast({
        title: "Sign in required",
        description: "Please sign in to comment",
        variant: "destructive"
      });
      return;
    }

    const trimmedComment = newComment.trim();
    if (!trimmedComment) {
      toast({
        title: "Error",
        description: "Please enter a comment",
        variant: "destructive"
      });
      return;
    }

    // Check for profanity
    const profanityCheck = checkProfanity(trimmedComment);
    if (!profanityCheck.isClean) {
      toast({
        title: "Content not allowed",
        description: getCategoryMessage(profanityCheck.category || ""),
        variant: "destructive"
      });
      return;
    }

    setIsSubmittingComment(true);
    addCommentMutation.mutate(trimmedComment);
  };

  const handleDeleteComment = (commentId: string) => {
    deleteCommentMutation.mutate(commentId);
  };


  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Video link has been copied to clipboard",
    });
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner w-8 h-8"></div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link href="/">
                <img 
                  src={logoImage} 
                  alt="neonvideo.ai" 
                  className="h-16 cursor-pointer" 
                />
              </Link>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Video not found</h1>
          <p className="text-muted-foreground mb-8">
            This video doesn't exist or has been removed.
          </p>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go to Homepage
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" data-testid="video-page">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-16 cursor-pointer" 
              />
            </Link>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="gap-2"
                data-testid="button-share-video"
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGreetingCardModal(true)}
                className="gap-2 text-pink-500 border-pink-500/50 hover:bg-pink-500/10"
                data-testid="button-gift-video"
              >
                <Gift className="h-4 w-4" />
                Gift
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Video Player */}
          <Card className={`overflow-hidden mb-6 ${video.aspectRatio === "3:4" ? "max-w-md mx-auto" : ""}`}>
            <div className={`relative bg-black ${video.aspectRatio === "3:4" ? "aspect-[3/4]" : "aspect-video"}`}>
              <MuxVideoPlayer
                playbackId={video.mux?.assetStatus === 'ready' ? video.mux.playbackId : null}
                bunnyHlsUrl={video.bunny?.status === 'finished' ? video.bunny.hlsUrl : null}
                bunnyEmbedUrl={video.bunny?.embedUrl ?? null}
                fallbackUrl={video.videoUrl}
                className="w-full h-full object-contain"
                controls
                autoPlay
                data-testid="video-player"
                onLoadStart={() => {
                  console.log('Video started loading');
                }}
                onError={() => {
                  console.warn(`Failed to load video ${video.id}`);
                }}
              />
            </div>
          </Card>

          {/* Video Info */}
          <Card>
            <CardContent className="p-6">
              <h1 className="text-2xl font-bold mb-4">{video.title}</h1>
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{format(new Date(video.createdAt), "MMM d, yyyy")}</span>
                  <span>•</span>
                  <span>{formatDuration(video.duration)}</span>
                </div>
                <div className="flex items-center gap-4">
                  {/* Likes Count */}
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <ThumbsUp className="h-4 w-4" />
                    <span data-testid="likes-count">{video.likesCount || 0}</span>
                  </div>
                  {/* Like Button - Only show for authenticated users */}
                  {isAuthenticated && (
                    <Button
                      variant={likeStatus?.liked ? "default" : "outline"}
                      size="sm"
                      onClick={handleLikeToggle}
                      disabled={likeMutation.isPending || unlikeMutation.isPending}
                      className="gap-2"
                      data-testid="button-like-video"
                    >
                      <ThumbsUp 
                        className={`h-4 w-4 ${likeStatus?.liked ? 'fill-current' : ''}`} 
                      />
                      {likeStatus?.liked ? 'Liked' : 'Like'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Creator Info */}
              <div className="border-t pt-6">
                <div className="flex items-center justify-between">
                  <Link href={`/u/${video.creator.username}`}>
                    <div className="flex items-center gap-4 hover:opacity-80 transition-opacity cursor-pointer">
                      <Avatar className="h-12 w-12 border-2 border-primary/20">
                        {video.creator.avatarUrl ? (
                          <AvatarImage src={convertAvatarUrlToImageKit(video.creator.avatarUrl) || video.creator.avatarUrl} alt={video.creator.username} />
                        ) : (
                          <AvatarFallback className="text-lg bg-gradient-to-br from-primary/20 to-secondary/20">
                            {video.creator.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div>
                        <p className="font-semibold">@{video.creator.username}</p>
                        <p className="text-sm text-muted-foreground">Creator</p>
                      </div>
                    </div>
                  </Link>
                  <Link href={`/u/${video.creator.username}`}>
                    <Button variant="outline" size="sm" data-testid="button-view-creator-profile">
                      <User className="h-4 w-4 mr-2" />
                      View Profile
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Comments Section */}
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <MessageCircle className="h-5 w-5" />
                  <h3 className="text-lg font-semibold">Comments ({comments.length})</h3>
                </div>

                {/* Add Comment Form - Only for authenticated users */}
                {isAuthenticated && (
                  <div className="mb-6">
                    <div className="flex gap-3">
                      <Avatar className="h-8 w-8 border border-border">
                        {user?.avatarUrl ? (
                          <AvatarImage src={convertAvatarUrlToImageKit(user.avatarUrl) || user.avatarUrl} alt={user.username} />
                        ) : (
                          <AvatarFallback className="text-sm bg-gradient-to-br from-primary/20 to-secondary/20">
                            {user?.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1">
                        <Textarea
                          placeholder="Add a comment..."
                          value={newComment}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            setNewComment(newValue);
                            // Check for profanity in real-time
                            const profanityResult = checkProfanity(newValue);
                            setCommentProfanityCheck(profanityResult);
                          }}
                          className={`min-h-[80px] resize-none ${
                            commentProfanityCheck && !commentProfanityCheck.isClean ? 'border-red-500' : ''
                          }`}
                          maxLength={500}
                          data-testid="textarea-add-comment"
                        />
                        <div className="flex justify-between items-center mt-2">
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">
                              {newComment.length}/500 characters
                            </span>
                            {commentProfanityCheck && !commentProfanityCheck.isClean && (
                              <span className="text-xs text-red-500 mt-1">
                                {getCategoryMessage(commentProfanityCheck.category || "")}
                              </span>
                            )}
                          </div>
                          <Button
                            onClick={handleCommentSubmit}
                            disabled={!newComment.trim() || isSubmittingComment || addCommentMutation.isPending || (commentProfanityCheck && !commentProfanityCheck.isClean)}
                            size="sm"
                            className="gap-2"
                            data-testid="button-submit-comment"
                          >
                            <Send className="h-4 w-4" />
                            {isSubmittingComment ? "Posting..." : "Post"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Comments List */}
                <div className="space-y-4">
                  {comments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No comments yet</p>
                      <p className="text-sm">Be the first to share your thoughts!</p>
                    </div>
                  ) : (
                    comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3" data-testid={`comment-${comment.id}`}>
                        <Avatar className="h-8 w-8 border border-border">
                          {comment.user.avatarUrl ? (
                            <AvatarImage src={convertAvatarUrlToImageKit(comment.user.avatarUrl) || comment.user.avatarUrl} alt={comment.user.username} />
                          ) : (
                            <AvatarFallback className="text-sm bg-gradient-to-br from-primary/20 to-secondary/20">
                              {comment.user.username.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm" data-testid={`comment-username-${comment.id}`}>
                                @{comment.user.username}
                              </span>
                              <span className="text-xs text-muted-foreground" data-testid={`comment-time-${comment.id}`}>
                                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                            {/* Delete button - only show for comment owner */}
                            {isAuthenticated && user?.id === comment.user.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteComment(comment.id)}
                                disabled={deleteCommentMutation.isPending}
                                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                                data-testid={`button-delete-comment-${comment.id}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <p className="text-sm mt-1 whitespace-pre-wrap" data-testid={`comment-content-${comment.id}`}>
                            {comment.content}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Send as Greeting Card Modal */}
      <SendGreetingCardModal
        isOpen={showGreetingCardModal}
        onClose={() => setShowGreetingCardModal(false)}
        projectId={videoId}
        videoTitle={video.title}
      />
    </div>
  );
}