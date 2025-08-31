import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "@/components/ui/audio-player";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Upload, Music, Library, Calendar, Tag, Check, Play, RotateCcw } from "lucide-react";
import { format } from "date-fns";

interface AudioCreationStepProps {
  projectId: string;
  audioUrl?: string;
  onNext: () => void;
}

interface GeneratedSong {
  id: string;
  title: string;
  audioUrl: string;
  audioTags: string | null;
  audioLyrics: string | null;
  createdAt: string;
  updatedAt: string;
}

const suggestedTags = ["pop", "electronic", "rock", "acoustic", "jazz", "hip-hop", "country", "reggae", "synthwave", "kpop", "female singer", "male singer"];

export function AudioCreationStep({ projectId, audioUrl, onNext }: AudioCreationStepProps) {
  const [currentAudioUrl, setCurrentAudioUrl] = useState(audioUrl);
  const [activeTab, setActiveTab] = useState("generate");
  
  // Upload tab state
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Generate tab state
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [progress, setProgress] = useState(0);
  
  // Library tab state
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Fetch user's songs for library tab
  const { data: songs = [], isLoading: songsLoading } = useQuery<GeneratedSong[]>({
    queryKey: ["/api/my-songs"],
    enabled: activeTab === "library",
  });

  // Upload mutations
  const uploadAudioMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('audio', file);
      
      const response = await fetch(`/api/projects/${projectId}/upload-audio`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentAudioUrl(data.audioUrl);
      setIsUploading(false);
      toast({
        title: "Success",
        description: `Audio file "${data.originalName}" uploaded successfully!`,
      });
    },
    onError: (error) => {
      setIsUploading(false);
      toast({
        title: "Upload Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Generate mutations
  const generateLyricsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-lyrics`, {
        description
      });
      return response.json();
    },
    onSuccess: (data) => {
      setLyrics(data.lyrics);
      toast({
        title: "Success",
        description: "Lyrics generated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to generate lyrics",
        variant: "destructive",
      });
    }
  });

  const generateSongMutation = useMutation({
    mutationFn: async () => {
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 1000);

      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-song`, {
        tags,
        lyrics
      });

      clearInterval(progressInterval);
      setProgress(100);
      
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentAudioUrl(data.audioUrl);
      setProgress(0);
      toast({
        title: "Success",
        description: "Song generated successfully!",
      });
    },
    onError: (error) => {
      setProgress(0);
      toast({
        title: "Error",
        description: "Failed to generate song",
        variant: "destructive",
      });
    }
  });

  // Library mutations
  const selectFromLibraryMutation = useMutation({
    mutationFn: async (song: GeneratedSong) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/select-song`, {
        audioUrl: song.audioUrl,
        audioTags: song.audioTags,
        audioLyrics: song.audioLyrics,
        audioType: 'generated'
      });
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentAudioUrl(data.audioUrl);
      toast({
        title: "Success",
        description: "Song selected from library!",
      });
    },
    onError: (error) => {
      toast({
        title: "Selection Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Upload handlers
  const handleFileSelect = (file: File) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/mp3'];
    const isValidType = allowedTypes.includes(file.type) || 
                       file.name.match(/\.(mp3|wav|aac)$/i);
    
    if (!isValidType) {
      toast({
        title: "Invalid File Type",
        description: "Please select an MP3, WAV, or AAC audio file.",
        variant: "destructive",
      });
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    uploadAudioMutation.mutate(file);
  };

  const handleAudioUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Generate handlers
  const addTag = (tag: string) => {
    const currentTags = tags.split(",").map(t => t.trim()).filter(Boolean);
    if (!currentTags.includes(tag)) {
      setTags(currentTags.concat(tag).join(", "));
    }
  };

  const canGenerate = description.trim().length > 10 && tags.trim().length > 0;

  // Library handlers
  const togglePlay = (songId: string) => {
    if (playingSongId === songId) {
      setPlayingSongId(null);
    } else {
      setPlayingSongId(songId);
    }
  };

  const handleSelectSong = () => {
    const selectedSong = songs.find(s => s.id === selectedSongId);
    if (selectedSong) {
      selectFromLibraryMutation.mutate(selectedSong);
    }
  };

  return (
    <div className="max-w-5xl mx-auto mb-12" data-testid="audio-creation-step">
      <div className="bg-card border border-border rounded-lg p-8">
        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2"
            data-testid="start-over-button"
          >
            <RotateCcw className="w-4 h-4" />
            Start over
          </Button>
        </div>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold gradient-text mb-4">Create Your Music</h3>
          <p className="text-muted-foreground">Choose how you want to create the soundtrack for your music video</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generate" className="flex items-center gap-2">
              <Music className="w-4 h-4" />
              Generate with AI
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload Audio File
            </TabsTrigger>
            <TabsTrigger value="library" className="flex items-center gap-2">
              <Library className="w-4 h-4" />
              Select from Library
            </TabsTrigger>
          </TabsList>

          {/* Generate with AI Tab */}
          <TabsContent value="generate" className="mt-6 space-y-6">
            <div>
              <Label className="flex items-center text-sm font-semibold mb-2">
                <i className="fas fa-lightbulb text-accent mr-2"></i>
                What is your song about?
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., A lonely cowboy cat riding through the desert at sunset..."
                rows={3}
                className="resize-none"
                data-testid="song-description-input"
              />
              <p className="text-xs text-muted-foreground mt-1">Describe the theme, mood, or story of your song</p>
            </div>

            <div>
              <Label className="flex items-center text-sm font-semibold mb-2">
                <i className="fas fa-tags text-primary mr-2"></i>
                Musical Style & Tags
              </Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., electronic, pop, female singer, upbeat, dreamy"
                data-testid="song-tags-input"
              />
              <p className="text-xs text-muted-foreground mt-1">Separate tags with commas</p>
              
              <div className="flex flex-wrap gap-2 mt-3">
                {suggestedTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => addTag(tag)}
                    className="text-xs bg-primary/20 text-primary px-2 py-1 rounded cursor-pointer hover:bg-primary/30 transition-colors"
                    data-testid={`tag-${tag}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center text-sm font-semibold">
                  <i className="fas fa-pencil-alt text-accent mr-2"></i>
                  Lyrics
                </Label>
                <Button
                  onClick={() => generateLyricsMutation.mutate()}
                  disabled={!description.trim() || generateLyricsMutation.isPending}
                  className="bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white"
                  data-testid="generate-lyrics-button"
                >
                  {generateLyricsMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Generating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-magic mr-2"></i>
                      Generate Lyrics with AI
                    </>
                  )}
                </Button>
              </div>
              <div className="space-y-3">
                <Textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder="Enter your lyrics here or click 'Generate Lyrics with AI' to create them automatically..."
                  rows={6}
                  className="resize-none"
                  data-testid="lyrics-textarea"
                />
              </div>
            </div>

            {generateSongMutation.isPending && (
              <div className="bg-muted/30 rounded-lg p-4" data-testid="song-generation-progress">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold">Generating Song...</span>
                  <div className="loading-spinner"></div>
                </div>
                <Progress value={progress} className="mb-2" />
                <p className="text-sm text-muted-foreground">
                  {progress < 30 ? "Processing your request..." :
                   progress < 60 ? "Generating musical composition..." :
                   progress < 80 ? "Creating vocals..." :
                   progress < 100 ? "Mixing and mastering..." :
                   "Song generation complete!"}
                </p>
              </div>
            )}

            <Button
              onClick={() => generateSongMutation.mutate()}
              disabled={!canGenerate || generateSongMutation.isPending}
              className="w-full floating-button"
              data-testid="generate-song-button"
            >
              <i className="fas fa-magic mr-2"></i>
              Generate Song
            </Button>
          </TabsContent>

          {/* Upload Audio File Tab */}
          <TabsContent value="upload" className="mt-6 space-y-4">
            <div 
              className={`upload-zone rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragOver ? 'border-primary bg-primary/10' : ''
              } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
              data-testid="audio-upload-zone"
              onClick={handleAudioUpload}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Music className="w-12 h-12 text-muted-foreground mb-4 mx-auto" />
              {isUploading ? (
                <p className="text-muted-foreground mb-2">Uploading audio file...</p>
              ) : (
                <>
                  <p className="text-muted-foreground mb-2">Drag and drop your audio file here</p>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                </>
              )}
              <p className="text-xs text-muted-foreground mt-2">Supports MP3, WAV, AAC (Max 10MB)</p>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.aac,audio/*"
              onChange={handleFileInputChange}
              className="hidden"
            />

            <Button 
              onClick={handleAudioUpload}
              disabled={isUploading}
              className="w-full floating-button"
              data-testid="upload-audio-button"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? 'Uploading...' : 'Upload Audio'}
            </Button>
          </TabsContent>

          {/* Select from Library Tab */}
          <TabsContent value="library" className="mt-6">
            {songsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="loading-spinner w-6 h-6"></div>
              </div>
            ) : songs.length === 0 ? (
              <div className="text-center py-12">
                <Music className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No songs in your library yet
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Generate some songs first to build your library
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {songs.map((song) => (
                    <Card 
                      key={song.id}
                      className={`cursor-pointer transition-all ${
                        selectedSongId === song.id 
                          ? 'border-primary ring-2 ring-primary/20' 
                          : 'hover:border-primary/50'
                      }`}
                      onClick={() => setSelectedSongId(song.id)}
                      data-testid={`song-option-${song.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {selectedSongId === song.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                              <h3 className="font-semibold">{song.title}</h3>
                            </div>
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
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePlay(song.id);
                            }}
                            data-testid={`button-preview-${song.id}`}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            {playingSongId === song.id ? 'Stop' : 'Preview'}
                          </Button>
                        </div>
                        {playingSongId === song.id && (
                          <audio
                            src={song.audioUrl}
                            controls
                            autoPlay
                            className="w-full mt-3"
                            onEnded={() => setPlayingSongId(null)}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`audio-preview-${song.id}`}
                          />
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                <Button 
                  onClick={handleSelectSong} 
                  disabled={!selectedSongId}
                  className="w-full floating-button"
                  data-testid="button-select-song"
                >
                  Use Selected Song
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Current Audio Display */}
        {currentAudioUrl && (
          <div className="mt-8">
            <AudioPlayer audioUrl={currentAudioUrl} title="Your Selected Audio" />
          </div>
        )}

        {/* Next Step Button */}
        <div className="text-center mt-8">
          <Button
            onClick={onNext}
            disabled={!currentAudioUrl}
            className="floating-button text-lg py-3 px-8"
            data-testid="continue-to-character-button"
          >
            Continue to Character Creation
          </Button>
        </div>
      </div>
    </div>
  );
}