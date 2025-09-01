import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music, Calendar, Download, Play, ArrowLeft, LogOut, User, Home as HomeIcon, Video, Tag } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import logoImage from "@assets/neonlogo_1756693683433.png";

interface GeneratedSong {
  id: string;
  title: string;
  audioUrl: string;
  audioTags: string | null;
  audioLyrics: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function MySongsPage() {
  const { user, logout } = useAuth();
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);

  const { data: songs = [], isLoading } = useQuery<GeneratedSong[]>({
    queryKey: ["/api/my-songs"],
  });

  const handleDownload = (audioUrl: string, title: string) => {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `${title.replace(/\s+/g, '_')}.mp3`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const togglePlay = (songId: string) => {
    if (playingSongId === songId) {
      setPlayingSongId(null);
    } else {
      setPlayingSongId(songId);
    }
  };

  return (
    <div className="min-h-screen" data-testid="my-songs-page">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-16" 
                data-testid="app-logo"
              />
              <nav className="flex items-center space-x-4">
                <Link href="/">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <HomeIcon className="h-4 w-4 mr-2" />
                    Create
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" disabled className="text-foreground">
                  <Music className="h-4 w-4 mr-2" />
                  My Songs
                </Button>
                <Link href="/my-videos">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <Video className="h-4 w-4 mr-2" />
                    My Videos
                  </Button>
                </Link>
              </nav>
            </div>
            
            <div className="flex items-center space-x-4">
              <Link href="/profile">
                <div className="flex items-center space-x-2 hover:text-foreground cursor-pointer transition-colors">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground hover:text-foreground">{user?.username}</span>
                </div>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              My Songs
              {songs.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({songs.length})
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Your AI-generated songs library
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="loading-spinner w-6 h-6"></div>
              </div>
            ) : songs.length === 0 ? (
              <div className="text-center py-12">
                <Music className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  No songs generated yet
                </p>
                <Link href="/">
                  <Button variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Generate Your First Song
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {songs.map((song) => (
                  <Card 
                    key={song.id} 
                    className="overflow-hidden hover:border-primary/50 transition-colors"
                    data-testid={`song-card-${song.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold mb-2">{song.title}</h3>
                          {song.audioTags && (
                            <div className="flex items-center gap-2 mb-2">
                              <Tag className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">{song.audioTags}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(song.createdAt), "MMM d, yyyy")}
                          </div>
                          {song.audioLyrics && (
                            <details className="mt-3">
                              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                View Lyrics
                              </summary>
                              <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/50 p-3 rounded">
                                {song.audioLyrics}
                              </pre>
                            </details>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => togglePlay(song.id)}
                            data-testid={`button-play-${song.id}`}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            {playingSongId === song.id ? 'Stop' : 'Play'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(song.audioUrl, song.title)}
                            data-testid={`button-download-${song.id}`}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {playingSongId === song.id && (
                        <audio
                          src={song.audioUrl}
                          controls
                          autoPlay
                          className="w-full mt-4"
                          onEnded={() => setPlayingSongId(null)}
                          data-testid={`audio-player-${song.id}`}
                        />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}