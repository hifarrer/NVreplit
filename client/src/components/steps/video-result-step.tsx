import { useState } from "react";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/ui/video-player";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

interface VideoResultStepProps {
  projectId: string;
  videoUrl: string;
  onCreateNew: () => void;
}

export function VideoResultStep({ projectId, videoUrl, onCreateNew }: VideoResultStepProps) {
  const [showLogs, setShowLogs] = useState(false);
  const { toast } = useToast();

  const { data: logs = [] } = useQuery({
    queryKey: ["/api/projects", projectId, "logs"],
    enabled: showLogs,
  });

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

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString();
  };

  return (
    <div className="max-w-4xl mx-auto mb-12" data-testid="video-result-step">
      <div className="bg-card border border-border rounded-lg p-8">
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

        {/* Video Details */}
        <div className="bg-muted/20 rounded-lg p-6 mb-8">
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <i className="fas fa-clock text-primary text-2xl mb-2"></i>
              <h5 className="font-semibold">Duration</h5>
              <p className="text-muted-foreground" data-testid="video-duration">2:00 minutes</p>
            </div>
            <div>
              <i className="fas fa-film text-accent text-2xl mb-2"></i>
              <h5 className="font-semibold">Resolution</h5>
              <p className="text-muted-foreground" data-testid="video-resolution">1920x1080 HD</p>
            </div>
            <div>
              <i className="fas fa-download text-primary text-2xl mb-2"></i>
              <h5 className="font-semibold">File Size</h5>
              <p className="text-muted-foreground" data-testid="video-size">~45 MB</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 justify-center mb-8">
          <Button 
            onClick={downloadVideo}
            className="floating-button"
            data-testid="download-video-button"
          >
            <i className="fas fa-download mr-2"></i>
            Download Video
          </Button>
          <Button 
            variant="secondary"
            onClick={shareVideo}
            data-testid="share-video-button"
          >
            <i className="fas fa-share mr-2"></i>
            Share Video
          </Button>
          <Button 
            variant="outline"
            onClick={onCreateNew}
            data-testid="create-new-video-button"
          >
            <i className="fas fa-plus mr-2"></i>
            Create New Video
          </Button>
        </div>

        {/* Generation Log */}
        <div>
          <details className="bg-muted/20 rounded-lg" open={showLogs}>
            <summary 
              className="p-4 cursor-pointer font-semibold flex items-center"
              onClick={() => setShowLogs(!showLogs)}
              data-testid="generation-log-toggle"
            >
              <i className="fas fa-list text-accent mr-2"></i>
              View Generation Log
              <i className={`fas fa-chevron-${showLogs ? 'up' : 'down'} ml-auto`}></i>
            </summary>
            <div className="p-4 pt-0">
              <div className="space-y-2 text-sm font-mono" data-testid="generation-log-content">
                {logs.map((log: any, index: number) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-muted-foreground">
                      [{formatTime(log.createdAt)}]
                    </span>
                    <span className={
                      log.status === 'completed' ? 'text-green-400' :
                      log.status === 'error' ? 'text-red-400' :
                      'text-foreground'
                    }>
                      {log.message}
                    </span>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="text-muted-foreground text-center py-4">
                    No logs available
                  </div>
                )}
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
