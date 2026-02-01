import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2, MessageCircle, Calendar, Video, Loader2, AlertTriangle, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { convertAvatarUrlToImageKit } from "@/lib/utils";

interface CommentWithVideo {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
  video: {
    id: string;
    title: string;
    creator: {
      username: string;
    };
  };
}

export function CommentManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteConfirmComment, setDeleteConfirmComment] = useState<CommentWithVideo | null>(null);

  // Fetch comments with auth header
  const { data: comments, isLoading } = useQuery<CommentWithVideo[]>({
    queryKey: ["/api/admin/comments"],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/comments", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/comments/${commentId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to delete comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comments"] });
      setDeleteConfirmComment(null);
      toast({
        title: "Success",
        description: "Comment deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card className="bg-black/30 border-purple-500/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-white">Comment Management</h2>
          <p className="text-gray-300">View and moderate user comments</p>
        </div>
        <Badge variant="outline" className="bg-purple-600/20 text-purple-300 border-purple-500/30">
          {comments?.length || 0} Total Comments
        </Badge>
      </div>

      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-purple-400" />
            All Comments
          </CardTitle>
          <CardDescription className="text-gray-300">
            Manage and moderate comments across all videos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!comments || comments.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No comments found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="p-4 rounded-lg bg-black/20 border border-purple-500/10 hover:border-purple-500/30 transition-colors"
                  data-testid={`admin-comment-${comment.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Comment Header */}
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-purple-500/20">
                          {comment.user.avatarUrl ? (
                            <AvatarImage src={convertAvatarUrlToImageKit(comment.user.avatarUrl) || comment.user.avatarUrl} alt={comment.user.username} />
                          ) : (
                            <AvatarFallback className="bg-purple-600/20 text-purple-300">
                              {comment.user.username.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">@{comment.user.username}</span>
                            <Badge variant="secondary" className="bg-gray-600/20 text-gray-300">
                              <User className="h-3 w-3 mr-1" />
                              Commenter
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(comment.createdAt), "MMM dd, yyyy 'at' HH:mm")}
                          </div>
                        </div>
                      </div>

                      {/* Comment Content */}
                      <div className="pl-11">
                        <p className="text-gray-200 whitespace-pre-wrap bg-black/30 p-3 rounded border border-purple-500/10">
                          {comment.content}
                        </p>
                      </div>

                      {/* Video Info */}
                      <div className="pl-11">
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <Video className="h-4 w-4" />
                          <span>On video:</span>
                          <span className="text-purple-300 font-medium">{comment.video.title}</span>
                          <span>by</span>
                          <span className="text-gray-300">@{comment.video.creator.username}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteConfirmComment(comment)}
                            data-testid={`button-delete-comment-${comment.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-gray-900 border-red-500/20">
                          <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-red-400" />
                              Delete Comment
                            </DialogTitle>
                            <DialogDescription className="text-gray-300">
                              Are you sure you want to delete this comment? This action cannot be undone.
                            </DialogDescription>
                          </DialogHeader>
                          <Alert className="border-red-500/20 bg-red-950/20">
                            <AlertTriangle className="h-4 w-4 text-red-400" />
                            <AlertDescription className="text-red-300">
                              <strong>Warning:</strong> This will permanently remove the comment from the video.
                            </AlertDescription>
                          </Alert>
                          <div className="flex justify-end gap-3 mt-4">
                            <Button
                              variant="outline"
                              onClick={() => setDeleteConfirmComment(null)}
                              className="border-gray-600 text-gray-300 hover:bg-gray-700"
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => {
                                if (deleteConfirmComment) {
                                  deleteCommentMutation.mutate(deleteConfirmComment.id);
                                }
                              }}
                              disabled={deleteCommentMutation.isPending}
                              className="bg-red-600 hover:bg-red-700"
                              data-testid="button-confirm-delete-comment"
                            >
                              {deleteCommentMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Comment
                                </>
                              )}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}