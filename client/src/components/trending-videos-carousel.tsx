import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Play, Video } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

interface TrendingVideo {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  duration: number;
  creator: {
    username: string;
    avatarUrl?: string;
  };
}

// Static featured videos (ImageKit URLs) used while video is loading - avoids broken Replit storage URLs
const STATIC_FEATURED_VIDEOS: TrendingVideo[] = [
  { id: "featured-1", title: "NeonVideo", videoUrl: "https://ik.imagekit.io/neonvideo/videos/neonvideo_1771741007951_captioned_aSgYYd8yE.mp4", thumbnailUrl: null, createdAt: new Date(), duration: 30, creator: { username: "NeonVideo" } },
  { id: "featured-2", title: "NeonVideo", videoUrl: "https://ik.imagekit.io/neonvideo/videos/neonvideo_1771740214845_m932Op8ks.mp4", thumbnailUrl: null, createdAt: new Date(), duration: 30, creator: { username: "NeonVideo" } },
  { id: "featured-3", title: "NeonVideo", videoUrl: "https://ik.imagekit.io/neonvideo/videos/neonvideo_1771735933375_rxcp9YckL.mp4", thumbnailUrl: null, createdAt: new Date(), duration: 30, creator: { username: "NeonVideo" } },
  { id: "featured-4", title: "NeonVideo", videoUrl: "https://ik.imagekit.io/neonvideo/videos/neonvideo_1771718298468_captioned_708oQe-LU.mp4", thumbnailUrl: null, createdAt: new Date(), duration: 30, creator: { username: "NeonVideo" } },
  { id: "featured-5", title: "NeonVideo", videoUrl: "https://ik.imagekit.io/neonvideo/videos/neonvideo_1771628710421_0xNAJ_kII.mp4", thumbnailUrl: null, createdAt: new Date(), duration: 30, creator: { username: "NeonVideo" } },
  { id: "featured-6", title: "NeonVideo", videoUrl: "https://ik.imagekit.io/neonvideo/videos/neonvideo_1771610628956_captioned_y6h9Bfc7X.mp4", thumbnailUrl: null, createdAt: new Date(), duration: 30, creator: { username: "NeonVideo" } },
  { id: "featured-7", title: "NeonVideo", videoUrl: "https://ik.imagekit.io/neonvideo/videos/neonvideo_1771472683273_OvQeWWz22.mp4", thumbnailUrl: null, createdAt: new Date(), duration: 30, creator: { username: "NeonVideo" } },
];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface TrendingVideosCarouselProps {
  /** When true, use static ImageKit featured videos instead of API (for "while loading" on video generation step) */
  useStaticFeaturedVideos?: boolean;
}

export function TrendingVideosCarousel({ useStaticFeaturedVideos = false }: TrendingVideosCarouselProps) {
  const [selectedVideo, setSelectedVideo] = useState<TrendingVideo | null>(null);
  const [videoError, setVideoError] = useState(false);
  const { user } = useAuth();

  const { data, isLoading } = useQuery<TrendingVideo[]>({
    queryKey: ["/api/trending-videos", user?.id],
    queryFn: async () => {
      const params = user?.id ? `?excludeUserId=${user.id}` : '';
      const response = await fetch(`/api/trending-videos${params}`);
      if (!response.ok) throw new Error('Failed to fetch trending videos');
      return response.json();
    },
    enabled: !useStaticFeaturedVideos,
  });

  const videos = useStaticFeaturedVideos ? STATIC_FEATURED_VIDEOS : (data || []);

  if (isLoading && !useStaticFeaturedVideos) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="loading-spinner w-6 h-6"></div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-12">
        <Video className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
        <p className="text-muted-foreground">
          No trending videos available at the moment
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: "fit-content" }}>
          {videos.map((video) => (
            <Card 
              key={video.id} 
              className="overflow-hidden hover:border-primary/50 transition-all hover:scale-105 cursor-pointer bg-card/50 backdrop-blur-sm flex-shrink-0"
              onClick={() => setSelectedVideo(video)}
              style={{ width: "280px" }}
              data-testid={`trending-video-carousel-${video.id}`}
            >
              <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative overflow-hidden group">
                <video
                  className="absolute inset-0 w-full h-full object-cover"
                  src={video.videoUrl}
                  preload="metadata"
                  muted
                  onError={() => setVideoError(true)}
                />
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <Play className="h-10 w-10 text-white opacity-80 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                  {formatDuration(video.duration)}
                </div>
              </div>
              <CardContent className="p-3">
                <h3 className="font-semibold mb-1 line-clamp-1 text-sm">
                  {video.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="line-clamp-1">{video.creator.username}</span>
                  <span>•</span>
                  <span>{format(new Date(video.createdAt), "MMM d")}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {selectedVideo && (
        <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden" data-testid="video-player-modal-carousel">
            <div className="relative aspect-video bg-black">
              <video
                className="w-full h-full"
                src={selectedVideo.videoUrl}
                controls
                autoPlay
                onError={() => setVideoError(true)}
                data-testid="video-player-carousel"
              />
            </div>
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-2">{selectedVideo.title}</h3>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>By {selectedVideo.creator.username}</span>
                <span>{format(new Date(selectedVideo.createdAt), "MMM d, yyyy")}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}