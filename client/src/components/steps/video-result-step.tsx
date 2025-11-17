import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/ui/video-player";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { RotateCcw, Download, Share2, Plus, Edit } from "lucide-react";

interface VideoResultStepProps {
  projectId: string;
  videoUrl: string;
  onCreateNew: () => void;
}

export function VideoResultStep({ projectId, videoUrl, onCreateNew }: VideoResultStepProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleEdit = () => {
    // Add timestamp to force re-initialization of edit mode
    setLocation(`/create?edit=${projectId}&t=${Date.now()}`);
  };

  const downloadVideo = () => {
    // Create a temporary link to download the video
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = 'music-video.mp4';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Download Started",
      description: "Your music video download has started.",
    });
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

        {/* Video Player */}
        <div className="mb-8">
          <VideoPlayer
            videoUrl={videoUrl}
            title="Your AI Music Video"
            poster={videoUrl.replace('.mp4', '-poster.jpg')}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 justify-center mb-8">
          <Button 
            onClick={downloadVideo}
            className="floating-button"
            data-testid="download-video-button"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Video
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
