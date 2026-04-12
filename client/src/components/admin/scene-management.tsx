import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, ChevronLeft, ChevronRight, User, Mail, Calendar, Film } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SceneSource = "music_video" | "story_video";

interface AdminScene {
  projectId: string;
  userId: string;
  username: string;
  email: string;
  userCreatedAt: string;
  projectTitle: string;
  projectCreatedAt: string;
  projectUpdatedAt: string;
  imageUrl: string;
  sceneIndex: number;
  source: SceneSource;
}

interface ScenesResponse {
  scenes: AdminScene[];
  totalCount: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 48;

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function SceneManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [preview, setPreview] = useState<AdminScene | null>(null);
  const [toDelete, setToDelete] = useState<AdminScene | null>(null);

  const { data, isLoading, isFetching } = useQuery<ScenesResponse>({
    queryKey: ["/api/admin/scenes", offset, PAGE_SIZE],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const res = await fetch(`/api/admin/scenes?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch scenes");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (scene: AdminScene) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/scenes", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: scene.projectId,
          source: scene.source,
          sceneIndex: scene.sceneIndex,
        }),
      });
      const errJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errJson.error || "Failed to delete scene");
      return errJson;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scenes"] });
      setToDelete(null);
      setPreview(null);
      toast({ title: "Scene removed", description: "The image was deleted from storage and the project." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const scenes = data?.scenes ?? [];
  const totalCount = data?.totalCount ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + scenes.length < totalCount;

  return (
    <>
      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Film className="h-5 w-5 text-purple-400" />
                Scenes
              </CardTitle>
              <CardDescription className="text-gray-400">
                Video scene images from all users (music and story projects), newest first. Click a thumbnail to
                inspect; delete removes the file from Bunny storage and updates the user&apos;s project.
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-purple-600/20 text-purple-300 border-purple-500/30 w-fit">
              {totalCount} scene{totalCount === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {(isLoading || isFetching) && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
          )}

          {!isLoading && !isFetching && scenes.length === 0 && (
            <p className="text-center text-gray-400 py-12">No scene images found.</p>
          )}

          {!isLoading && scenes.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {scenes.map((scene, i) => (
                  <div
                    key={`${scene.projectId}-${scene.source}-${scene.sceneIndex}-${offset + i}`}
                    className="rounded-lg border border-purple-500/20 bg-black/20 overflow-hidden flex flex-col"
                  >
                    <button
                      type="button"
                      className="relative aspect-[3/4] w-full bg-black/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      onClick={() => setPreview(scene)}
                    >
                      <img
                        src={scene.imageUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                    </button>
                    <div className="p-2 space-y-1 text-xs flex-1 flex flex-col">
                      <div className="flex items-center gap-1 text-gray-300 min-w-0">
                        <User className="h-3 w-3 shrink-0 text-purple-400" />
                        <span className="truncate font-medium text-white">{scene.username}</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-400 min-w-0">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{scene.email}</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500 min-w-0">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span className="truncate" title={scene.projectCreatedAt}>
                          {formatWhen(scene.projectCreatedAt)}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] w-fit bg-black/40 text-gray-300">
                        {scene.source === "story_video" ? "Story" : "Music video"}
                      </Badge>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="w-full mt-auto text-xs h-8"
                        onClick={() => setToDelete(scene)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between mt-6">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!hasPrev || isFetching}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  className="border-purple-500/30 text-gray-200"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-gray-400">
                  {offset + 1}–{offset + scenes.length} of {totalCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!hasNext || isFetching}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  className="border-purple-500/30 text-gray-200"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="bg-gray-950 border-purple-500/30 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">Scene preview</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border border-purple-500/20 bg-black flex justify-center max-h-[70vh]">
                <img src={preview.imageUrl} alt="" className="max-w-full max-h-[70vh] object-contain" />
              </div>
              <div className="text-sm text-gray-300 space-y-1">
                <p>
                  <span className="text-gray-500">User:</span> {preview.username} ({preview.email})
                </p>
                <p>
                  <span className="text-gray-500">Project:</span> {preview.projectTitle}
                </p>
                <p>
                  <span className="text-gray-500">Project created:</span> {formatWhen(preview.projectCreatedAt)}
                </p>
                <p>
                  <span className="text-gray-500">User since:</span> {formatWhen(preview.userCreatedAt)}
                </p>
                <p>
                  <span className="text-gray-500">Type:</span>{" "}
                  {preview.source === "story_video" ? "Story video" : "Music video"} · scene index {preview.sceneIndex}
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={() => {
                  setToDelete(preview);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete this scene
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent className="bg-gray-950 border-purple-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete scene image?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This removes the file from Bunny storage (when applicable) and deletes this scene from the
              user&apos;s project. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600 text-gray-200">Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (toDelete) deleteMutation.mutate(toDelete);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
