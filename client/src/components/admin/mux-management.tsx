import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Play, Loader2, CheckCircle, AlertTriangle, Video, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MuxMigrationStatus {
  totalCompletedVideos: number;
  videosWithMuxAssets: number;
  videosWithMuxReady: number;
  videosWithMuxPreparing: number;
  videosWithMuxErrored: number;
  videosWithoutMux: number;
}

export function MuxManagement() {
  const { toast } = useToast();
  const [isMigrating, setIsMigrating] = useState(false);

  // Fetch migration status
  const { data: status, isLoading, refetch } = useQuery<MuxMigrationStatus>({
    queryKey: ["/api/admin/mux-migration-status"],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/mux-migration-status", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch migration status");
      return res.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Migration mutation
  const migrationMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/migrate-videos-to-mux", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to start migration");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Migration Started",
        description: `Migration initiated for ${data.totalVideos} videos`,
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Migration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsMigrating(false);
    },
  });

  const handleMigration = () => {
    setIsMigrating(true);
    migrationMutation.mutate();
  };

  if (isLoading) {
    return (
      <Card className="bg-black/30 border-purple-500/20">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card className="bg-black/30 border-purple-500/20">
        <CardContent className="text-center py-12 text-gray-400">
          Failed to load migration status
        </CardContent>
      </Card>
    );
  }

  // Calculate progress percentage
  const totalVideos = status.totalCompletedVideos;
  const videosWithMux = status.videosWithMuxAssets;
  const progressPercentage = totalVideos > 0 ? (videosWithMux / totalVideos) * 100 : 0;

  // Check if migration is needed
  const migrationNeeded = status.videosWithoutMux > 0;
  const hasProcessingVideos = status.videosWithMuxPreparing > 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-white">Mux Video Streaming</h2>
          <p className="text-sm text-gray-400">Manage HLS streaming for existing videos</p>
        </div>
        <Button
          onClick={() => refetch()}
          variant="outline"
          size="sm"
          className="border-purple-500/50 text-purple-300 hover:bg-purple-600/20"
          data-testid="button-refresh-status"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Migration Overview */}
      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Video className="h-5 w-5 mr-2 text-purple-400" />
            Migration Overview
          </CardTitle>
          <CardDescription className="text-gray-300">
            Convert existing videos to Mux HLS streaming for optimal performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Migration Progress</span>
              <span className="text-white">{videosWithMux}/{totalVideos} videos</span>
            </div>
            <Progress 
              value={progressPercentage} 
              className="h-2 bg-gray-700"
              data-testid="progress-migration"
            />
            <p className="text-xs text-gray-400">
              {progressPercentage.toFixed(1)}% of videos have Mux assets
            </p>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-white" data-testid="text-total-videos">
                  {totalVideos}
                </div>
                <div className="text-xs text-gray-400">Total Videos</div>
              </div>
            </div>
            
            <div className="bg-green-900/30 rounded-lg p-3 border border-green-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400" data-testid="text-ready-videos">
                  {status.videosWithMuxReady}
                </div>
                <div className="text-xs text-gray-400">Ready for Streaming</div>
              </div>
            </div>
            
            <div className="bg-yellow-900/30 rounded-lg p-3 border border-yellow-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400" data-testid="text-preparing-videos">
                  {status.videosWithMuxPreparing}
                </div>
                <div className="text-xs text-gray-400">Encoding</div>
              </div>
            </div>
            
            <div className="bg-red-900/30 rounded-lg p-3 border border-red-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400" data-testid="text-errored-videos">
                  {status.videosWithMuxErrored}
                </div>
                <div className="text-xs text-gray-400">Errors</div>
              </div>
            </div>
          </div>

          {/* Migration Status */}
          {migrationNeeded ? (
            <Alert className="border-yellow-500/50 bg-yellow-900/20">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <AlertDescription className="text-yellow-200">
                {status.videosWithoutMux} videos need to be migrated to Mux for HLS streaming.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-green-500/50 bg-green-900/20">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-200">
                All videos have been successfully migrated to Mux!
              </AlertDescription>
            </Alert>
          )}

          {hasProcessingVideos && (
            <Alert className="border-blue-500/50 bg-blue-900/20">
              <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
              <AlertDescription className="text-blue-200">
                {status.videosWithMuxPreparing} videos are currently being encoded by Mux.
              </AlertDescription>
            </Alert>
          )}

          {/* Migration Button */}
          <div className="flex justify-center">
            <Button
              onClick={handleMigration}
              disabled={!migrationNeeded || isMigrating || migrationMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white px-8"
              size="lg"
              data-testid="button-start-migration"
            >
              {isMigrating || migrationMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting Migration...
                </>
              ) : migrationNeeded ? (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Start Migration ({status.videosWithoutMux} videos)
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Migration Complete
                </>
              )}
            </Button>
          </div>

          {/* Info */}
          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
            <h4 className="text-sm font-medium text-white mb-2">About Mux Migration</h4>
            <div className="text-xs text-gray-400 space-y-1">
              <div>• Converts existing videos to HLS streaming for better performance</div>
              <div>• Provides adaptive bitrate streaming based on viewer's connection</div>
              <div>• Maintains original video quality while adding streaming optimization</div>
              <div>• Videos remain available during migration with automatic fallback</div>
              <div>• Production migration will work better than development (localhost limitations)</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}