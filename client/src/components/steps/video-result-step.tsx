import { Button } from "@/components/ui/button";
import { MuxVideoPlayer } from "@/components/mux-video-player";
import { useToast } from "@/hooks/use-toast";
import { downloadFileFromUrl } from "@/lib/utils";
import { useState } from "react";
import { RotateCcw, Download, Share2, Plus, Edit } from "lucide-react";

interface VideoResultStepProps {
  projectId: string;
  videoUrl: string;
  muxPlaybackId?: string | null;
  muxAssetStatus?: string | null;
  onCreateNew: () => void;
  aspectRatio?: string;
}

export function VideoResultStep({ projectId, videoUrl, muxPlaybackId, muxAssetStatus, onCreateNew, aspectRatio = "16:9" }: VideoResultStepProps) {
  const { toast } = useToast();
  const useMux = muxAssetStatus === "ready" && muxPlaybackId;

  const handleEdit = () => {
    window.location.href = `/create/story-mode?edit=${projectId}&t=${Date.now()}`;
  };

  const [isDownloading, setIsDownloading] = useState(false);

  const downloadVideo = async () => {
    setIsDownloading(true);
    try {
      await downloadFileFromUrl(videoUrl, "music-video.mp4");
      toast({
        title: "Download Started",
        description: "Your music video download has started.",
      });
    } catch {
      toast({
        title: "Download failed",
        description: "Could not download the video. Try opening the link and saving from your browser.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const shareVideo = () => {
    if (navigator.share) {
      navigator.share({
        title: 'My AI Music Video',
        text: 'Check out this music video I created with AI!',
        url: videoUrl,
      });
    } else {
      navigator.clipboard.writeText(videoUrl);
      toast({
        title: "Link Copied",
        description: "Share link copied to clipboard!",
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto mb-12 bg-card rounded-lg p-4" data-testid="video-result-step">
      <div className="bg-background border border-border rounded-lg p-8">
        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateNew}
            className="flex items-center gap-2"
            data-testid="start-over-button"
          >
            <RotateCcw className="w-4 h-4" />
            Start over
          </Button>
        </div>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold gradient-text mb-4">Your Music Video is Ready!</h3>
          <p className="text-muted-foreground">Here's your AI-generated music video. You can preview, download, or share it.</p>
        </div>

        {/* Video Player — Mux when ready, otherwise direct MP4 (Bunny Storage or other) */}
        <div className="mb-8">
          <div className="relative w-full" data-testid="video-player">
            <div className={aspectRatio === "3:4" ? "aspect-[3/4] max-w-md mx-auto" : "aspect-video"}>
              <MuxVideoPlayer
                playbackId={useMux ? muxPlaybackId : undefined}
                fallbackUrl={videoUrl}
                className="w-full h-full object-cover"
                controls
                data-testid="video-element"
              />
            </div>
            <div className="mt-4 text-center">
              <h4 className="text-lg font-semibold" data-testid="video-title">Your AI Music Video</h4>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 justify-center mb-8">
          <Button 
            onClick={downloadVideo}
            disabled={isDownloading}
            className="floating-button"
            data-testid="download-video-button"
          >
            {isDownloading ? (
              <>Downloading…</>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download Video
              </>
            )}
          </Button>
          <Button 
            variant="secondary"
            onClick={shareVideo}
            data-testid="share-video-button"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share Video
          </Button>
          <Button 
            variant="outline"
            onClick={handleEdit}
            data-testid="edit-video-button"
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit & Regenerate
          </Button>
          <Button 
            variant="outline"
            onClick={onCreateNew}
            data-testid="create-new-video-button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Video
          </Button>
        </div>
      </div>
    </div>
  );
}
