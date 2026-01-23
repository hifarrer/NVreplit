import { useState, useRef, useEffect } from "react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Upload, Music, Library, Calendar, Tag, Check, Play, RotateCcw, Lightbulb, Tags, PenTool, Sparkles, Loader2, Clock, X, Subtitles, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { checkProfanity, getCategoryMessage, type ProfanityCheckResult } from "@/lib/profanity-filter";
import { StepCircles } from "@/components/ui/step-circles";

interface AudioCreationStepProps {
  projectId: string;
  audioUrl?: string;
  aspectRatio?: string;
  projectAddSubtitles?: boolean;
  projectIncludeWatermark?: boolean;
  projectIsPublic?: boolean;
  onNext: () => void;
  onReset: () => void;
}

interface GeneratedSong {
  id: string;
  title: string;
  audioUrl: string;
  audioTags: string | null;
  audioLyrics: string | null;
  duration: number | null;
  subtitleFileUrl?: string | null;
  kieTaskId?: string | null;
  kieAudioId?: string | null;
  createdAt: string;
  updatedAt: string;
}

const suggestedTags = ["pop", "electronic", "rock", "upbeat", "hip-hop", "country", "reggae", "synthwave", "kpop", "female singer", "male singer"];

export function AudioCreationStep({ projectId, audioUrl, aspectRatio, projectAddSubtitles, projectIncludeWatermark, projectIsPublic, onNext, onReset }: AudioCreationStepProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Check if user is paid (has a plan with monthly price > 0)
  const isPaidUser = user?.plan && user.plan.monthlyPrice > 0;
  
  // Check if user is Premium (can disable watermark)
  const isPremiumUser = user?.plan?.name === "Premium";
  
  // Duration options based on user plan
  const durationOptions = isPaidUser 
    ? [30, 60, 90, 120, 150, 180]
    : [30]; // Free users can only make 30 second videos
  
  const maxDuration = isPaidUser ? 180 : 30;
  
  const getDurationLabel = (value: number) => {
    if (value === 30) return "30 sec";
    if (value === 60) return "1 min";
    if (value === 90) return "1.5 min";
    if (value === 120) return "2 min";
    if (value === 150) return "2.5 min";
    if (value === 180) return "3 min";
    return `${value} sec`;
  };
  const [currentAudioUrl, setCurrentAudioUrl] = useState(audioUrl);
  const [activeTab, setActiveTab] = useState("generate");
  
  // Upload tab state
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(""); // Status message for upload progress
  const [uploadSongTitle, setUploadSongTitle] = useState(""); // Song title for upload tab
  const [uploadSongDescription, setUploadSongDescription] = useState(""); // Song description for upload tab
  const [uploadAddSubtitles, setUploadAddSubtitles] = useState(true); // Subtitle toggle for uploaded songs - enabled by default
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Generate tab state
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [songTitle, setSongTitle] = useState(""); // Song title for generate tab
  const [duration, setDuration] = useState([isPaidUser ? 60 : 30]); // Default: 30s for free, 60s for paid
  const [addSubtitles, setAddSubtitles] = useState(projectAddSubtitles ?? true); // Subtitle toggle - hydrated from project or default to enabled
  const [includeWatermark, setIncludeWatermark] = useState(projectIncludeWatermark ?? true); // Watermark toggle - hydrated from project or default to enabled
  const [isPublic, setIsPublic] = useState(projectIsPublic ?? true); // Privacy toggle - hydrated from project or default to public
  const [isVertical, setIsVertical] = useState(aspectRatio === "3:4"); // Aspect ratio toggle - hydrated from project data, defaults to horizontal (16:9)
  const [progress, setProgress] = useState(0);
  
  // Hydrate state from project props when component mounts or props change
  useEffect(() => {
    setIsVertical(aspectRatio === "3:4");
  }, [aspectRatio]);
  
  useEffect(() => {
    if (projectAddSubtitles !== undefined) setAddSubtitles(projectAddSubtitles);
  }, [projectAddSubtitles]);
  
  useEffect(() => {
    if (projectIncludeWatermark !== undefined) setIncludeWatermark(projectIncludeWatermark);
  }, [projectIncludeWatermark]);
  
  useEffect(() => {
    if (projectIsPublic !== undefined) setIsPublic(projectIsPublic);
  }, [projectIsPublic]);
  const [generatedSubtitles, setGeneratedSubtitles] = useState<string | null>(null); // For debugging display
  const [profanityCheck, setProfanityCheck] = useState<ProfanityCheckResult | null>(null);
  const [descriptionProfanityCheck, setDescriptionProfanityCheck] = useState<ProfanityCheckResult | null>(null);
  
  // Song selection state
  const [generatedSongs, setGeneratedSongs] = useState<GeneratedSong[]>([]);
  const [showSongSelection, setShowSongSelection] = useState(false);
  const [selectedGeneratedSongIndex, setSelectedGeneratedSongIndex] = useState<number>(0);
  
  // Track actual song duration after generation (may differ from requested duration)
  const [actualSongDuration, setActualSongDuration] = useState<number | null>(null);
  
  // Library tab state
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [librarySongTitle, setLibrarySongTitle] = useState(""); // Custom title for library song
  
  // Calculate credit costs based on duration
  // Song generation is free, only video generation costs credits
  const getVideoCreditCost = (durationSeconds: number) => {
    // Pricing: 1000 credits for every 30 seconds of video (rounded down, minimum 1000)
    const units = Math.floor(durationSeconds / 30);
    return Math.max(units, 1) * 1000; // Minimum 1000 credits
  };
  
  // Use actual song duration if available (after generation), otherwise use slider duration
  const effectiveDuration = actualSongDuration ?? duration[0];
  const totalCreditsNeeded = getVideoCreditCost(effectiveDuration);
  const userCreditsRemaining = user?.creditsRemaining || 0;
  const hasEnoughCredits = userCreditsRemaining >= totalCreditsNeeded;

  // Fetch user's songs for library tab
  const { data: songs = [], isLoading: songsLoading } = useQuery<GeneratedSong[]>({
    queryKey: ["/api/my-songs"],
    enabled: activeTab === "library",
  });

  // Upload mutations
  const uploadAudioMutation = useMutation({
    mutationFn: async (file: File) => {
      return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('audio', file);
        if (uploadSongTitle.trim()) {
          formData.append('title', uploadSongTitle.trim());
        }
        if (uploadSongDescription.trim()) {
          formData.append('description', uploadSongDescription.trim());
        }
        formData.append('addSubtitles', uploadAddSubtitles ? 'true' : 'false');
        formData.append('aspectRatio', isVertical ? "3:4" : "16:9");
        formData.append('includeWatermark', includeWatermark ? 'true' : 'false');
        formData.append('isPublic', isPublic ? 'true' : 'false');
        
        const xhr = new XMLHttpRequest();
        let transcribeInterval: NodeJS.Timeout | null = null;
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            // Upload takes 0-50% of total progress
            setUploadProgress(percentComplete * 0.5);
            setUploadStatus("Uploading audio file...");
          }
        });
        
        // When upload completes, start simulating processing progress
        xhr.upload.addEventListener('load', () => {
          // Upload complete, now processing
          setUploadProgress(50);
          setUploadStatus("Processing audio file...");
          
          // Simulate processing progress while waiting for server response
          transcribeInterval = setInterval(() => {
            setUploadProgress(prev => {
              if (prev >= 95) {
                if (transcribeInterval) {
                  clearInterval(transcribeInterval);
                }
                return prev;
              }
              return prev + 3;
            });
          }, 400);
        });
        
        // Handle server response
        xhr.addEventListener('load', () => {
          if (transcribeInterval) {
            clearInterval(transcribeInterval);
          }
          
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              setUploadProgress(100);
              setUploadStatus("Complete!");
              resolve(response);
            } catch (error) {
              reject(new Error('Failed to parse response'));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.error || 'Upload failed'));
            } catch {
              reject(new Error('Upload failed'));
            }
          }
        });
        
        // Handle errors
        xhr.addEventListener('error', () => {
          if (transcribeInterval) {
            clearInterval(transcribeInterval);
          }
          reject(new Error('Upload failed due to network error'));
        });
        
        xhr.open('POST', `/api/projects/${projectId}/upload-audio`);
        xhr.send(formData);
      });
    },
    onSuccess: (data: any) => {
      setCurrentAudioUrl(data.audioUrl);
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatus("");
      // Update actual duration from uploaded audio
      if (data.duration) {
        setActualSongDuration(data.duration);
      }
      const sceneCount = Math.ceil(data.duration / 10);
      
      let description = `Audio uploaded successfully! Duration: ${Math.floor(data.duration / 60)}:${String(data.duration % 60).padStart(2, '0')} (${sceneCount} scenes will be generated)`;
      if (data.hasSubtitles) {
        description += ` Subtitles generated!`;
      }
      
      toast({
        title: "Success",
        description,
      });
    },
    onError: (error) => {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatus("");
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
        description,
        duration: duration[0]
      });
      return response.json();
    },
    onSuccess: (data) => {
      setLyrics(data.lyrics);
      setSongTitle(data.title); // Set the generated song title
      // Check for profanity in AI-generated lyrics
      const profanityResult = checkProfanity(data.lyrics);
      setProfanityCheck(profanityResult);
      
      if (profanityResult.isClean) {
        toast({
          title: "Success",
          description: "Lyrics and song title generated successfully!",
        });
      } else {
        toast({
          title: "Lyrics Generated with Issues",
          description: "AI generated lyrics contain inappropriate content. Please edit them before proceeding.",
          variant: "destructive",
        });
      }
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
          return prev + 5;
        });
      }, 2000);

      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-song`, {
        description,
        tags,
        lyrics,
        duration: duration[0],
        addSubtitles,
        includeWatermark,
        isPublic,
        aspectRatio: isVertical ? "3:4" : "16:9"
      });

      clearInterval(progressInterval);
      setProgress(100);
      
      return response.json();
    },
    onSuccess: (data) => {
      // Store generated subtitles for debugging display
      if (data.generatedSubtitlesContent) {
        setGeneratedSubtitles(data.generatedSubtitlesContent);
      }
      
      // Handle the new response format with multiple songs
      if (data.songs && data.songs.length > 0) {
        // Show song selection modal if multiple songs
        setGeneratedSongs(data.songs);
        setShowSongSelection(true);
        // Set actual duration from first song (they should all have similar durations)
        if (data.songs[0].duration) {
          setActualSongDuration(data.songs[0].duration);
        }
      } else if (data.audioUrl) {
        // Fallback for single song response
        setCurrentAudioUrl(data.audioUrl);
        // Set actual duration if available
        if (data.duration) {
          setActualSongDuration(data.duration);
        }
      }
      setProgress(0);
      toast({
        title: "Success",
        description: `Generated ${data.songs?.length || 1} song${data.songs?.length > 1 ? 's' : ''}! Choose your favorite.${data.subtitleFileUrl ? ' Subtitles generated!' : ''}`,
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

  // Select generated song mutation
  const selectGeneratedSongMutation = useMutation({
    mutationFn: async (songIndex: number) => {
      const selectedSong = generatedSongs[songIndex];
      const response = await apiRequest("POST", `/api/projects/${projectId}/select-song`, {
        audioUrl: selectedSong.audioUrl,
        audioTags: selectedSong.audioTags,
        audioLyrics: selectedSong.audioLyrics,
        title: selectedSong.title,
        duration: selectedSong.duration,
        subtitleFileUrl: selectedSong.subtitleFileUrl,
        kieTaskId: selectedSong.kieTaskId,
        kieAudioId: selectedSong.kieAudioId,
        aspectRatio: isVertical ? "3:4" : "16:9"
      });
      return response.json();
    },
    onSuccess: (data, songIndex) => {
      // Use the passed songIndex (which is the mutation variable)
      const selectedSong = generatedSongs[songIndex] ?? generatedSongs[selectedGeneratedSongIndex];
      setCurrentAudioUrl(data.audioUrl || selectedSong?.audioUrl);
      // Update actual duration from selected song
      if (selectedSong?.duration) {
        setActualSongDuration(selectedSong.duration);
      }
      setShowSongSelection(false);
      setGeneratedSongs([]);
      toast({
        title: "Success",
        description: "Song selected for your project!",
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

  // Library mutations
  const selectFromLibraryMutation = useMutation({
    mutationFn: async (song: GeneratedSong) => {
      const requestData: any = {
        audioUrl: song.audioUrl,
        audioTags: song.audioTags,
        audioLyrics: song.audioLyrics,
        audioType: 'library',
        duration: song.duration,
        subtitleFileUrl: song.subtitleFileUrl,
        kieTaskId: song.kieTaskId,
        kieAudioId: song.kieAudioId,
        aspectRatio: isVertical ? "3:4" : "16:9",
        addSubtitles,
        includeWatermark,
        isPublic
      };
      
      // Include custom title if provided
      if (librarySongTitle.trim()) {
        requestData.title = librarySongTitle.trim();
      }
      
      const response = await apiRequest("POST", `/api/projects/${projectId}/select-song`, requestData);
      return response.json();
    },
    onSuccess: (data, song) => {
      if (data.audioUrl) {
        setCurrentAudioUrl(data.audioUrl);
      }
      // Update actual duration from selected library song
      if (song.duration) {
        setActualSongDuration(song.duration);
      }
      // Invalidate project data to refresh the current step and show Continue button
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
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

  const canGenerate = description.trim().length >= 5 && tags.trim().length > 0;

  // Library handlers
  const togglePlay = (songId: string) => {
    if (playingSongId === songId) {
      setPlayingSongId(null);
    } else {
      setPlayingSongId(songId);
    }
  };

  const formatDuration = (seconds: number | null | undefined): string => {
    if (!seconds) return "Unknown";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };

  const handleSelectSong = () => {
    const selectedSong = songs.find(s => s.id === selectedSongId);
    if (selectedSong) {
      selectFromLibraryMutation.mutate(selectedSong);
    }
  };

  return (
    <div className="max-w-5xl mx-auto mb-12 bg-card rounded-lg p-4" data-testid="audio-creation-step">
      <div className="bg-background border border-border rounded-lg p-8">
        <div className="flex justify-between items-center mb-4">
          {/* Credit Usage Info */}
          <div className="text-sm text-muted-foreground">
            {(user?.creditsUsed || 0).toLocaleString()}/{((user?.creditsUsed || 0) + (userCreditsRemaining || 0)).toLocaleString()} credits used
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            className="flex items-center gap-2"
            data-testid="start-over-button"
          >
            <RotateCcw className="w-4 h-4" />
            Start over
          </Button>
        </div>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold gradient-text mb-4">Create Your Music Video</h3>
          <p className="text-muted-foreground">Choose how you want to create the soundtrack for your music video</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generate" className="flex items-center justify-center gap-2 px-2 sm:px-4">
              <Music className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Generate with AI</span>
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center justify-center gap-2 px-2 sm:px-4">
              <Upload className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Upload Audio File</span>
            </TabsTrigger>
            <TabsTrigger value="library" className="flex items-center justify-center gap-2 px-2 sm:px-4">
              <Library className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Select from Library</span>
            </TabsTrigger>
          </TabsList>

          {/* Generate with AI Tab */}
          <TabsContent value="generate" className="mt-6 space-y-6">
            <div>
              <Label className="flex items-center text-sm font-semibold mb-2">
                <Lightbulb className="w-4 h-4 text-accent mr-2" />
                What is your song about?
              </Label>
              <Textarea
                value={description}
                onChange={(e) => {
                  const newDescription = e.target.value;
                  setDescription(newDescription);
                  // Check for profanity when description changes
                  const profanityResult = checkProfanity(newDescription);
                  setDescriptionProfanityCheck(profanityResult);
                }}
                placeholder="e.g., A lonely cowboy cat riding through the desert at sunset..."
                rows={3}
                className={`resize-none ${
                  descriptionProfanityCheck?.isClean === false 
                    ? 'border-red-500 focus:border-red-500' 
                    : description.trim().length > 0 && description.trim().length < 5 
                      ? 'border-red-500' 
                      : ''
                }`}
                data-testid="song-description-input"
              />
              {descriptionProfanityCheck?.isClean === false && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded-md mt-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{descriptionProfanityCheck.category ? getCategoryMessage(descriptionProfanityCheck.category) : 'Please remove inappropriate content from your description.'}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {descriptionProfanityCheck?.isClean === false ? (
                  <span className="text-red-500">Please remove inappropriate content from your description before proceeding.</span>
                ) : description.trim().length > 0 && description.trim().length < 5 ? (
                  <span className="text-red-500">Description must be at least 5 characters (currently: {description.trim().length})</span>
                ) : description.trim().length >= 5 && tags.trim().length === 0 ? (
                  <span className="text-orange-500">Good! Now add at least one tag below to enable generation</span>
                ) : (
                  "Describe the theme, mood, or story of your song"
                )}
              </p>
            </div>

            {/* Song Duration */}
            <div>
              <Label className="flex items-center text-sm font-semibold mb-2">
                <i className="fas fa-clock text-accent mr-2"></i>
                Song Duration
              </Label>
              <div className="space-y-3">
                <div className="px-3">
                  <Slider
                    value={duration}
                    onValueChange={setDuration}
                    max={maxDuration}
                    min={30}
                    step={30}
                    className="w-full"
                    data-testid="duration-slider"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground px-1 flex-wrap gap-1">
                  {durationOptions.map(option => (
                    <span 
                      key={option}
                      className={duration[0] === option ? "text-primary font-medium" : ""}
                    >
                      {getDurationLabel(option)}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Current: {getDurationLabel(duration[0])}
                  {!isPaidUser && (
                    <span className="ml-2 text-orange-500">• Free users can only make 30 sec videos</span>
                  )}
                </p>
              </div>
            </div>

            {/* Subtitles, Watermark & Privacy Toggles - Single row */}
            <div className="flex flex-wrap gap-6">
              {/* Add Subtitles Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={addSubtitles}
                  onCheckedChange={setAddSubtitles}
                  data-testid="subtitles-toggle"
                />
                <Label className="text-sm font-medium cursor-pointer" onClick={() => setAddSubtitles(!addSubtitles)}>
                  Add Subtitles
                </Label>
              </div>

              {/* Watermark Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={includeWatermark}
                  onCheckedChange={setIncludeWatermark}
                  data-testid="watermark-toggle"
                  disabled={!isPremiumUser}
                />
                <Label className="text-sm font-medium cursor-pointer" onClick={() => isPremiumUser && setIncludeWatermark(!includeWatermark)}>
                  Watermark
                </Label>
              </div>

              {/* Public Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                  data-testid="privacy-toggle"
                  disabled={!isPremiumUser}
                />
                <Label className="text-sm font-medium cursor-pointer" onClick={() => isPremiumUser && setIsPublic(!isPublic)}>
                  Public
                </Label>
              </div>

              {/* Aspect Ratio Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={isVertical}
                  onCheckedChange={setIsVertical}
                  data-testid="aspect-ratio-toggle"
                />
                <Label className="text-sm font-medium cursor-pointer" onClick={() => setIsVertical(!isVertical)}>
                  {isVertical ? "Vertical (3:4)" : "Horizontal (16:9)"}
                </Label>
              </div>
            </div>

            <div>
              <Label className="flex items-center text-sm font-semibold mb-2">
                <Tags className="w-4 h-4 text-primary mr-2" />
                Musical Style & Tags
              </Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., electronic, pop, female singer, upbeat, dreamy"
                className={tags.trim().length === 0 && description.trim().length >= 5 ? 'border-red-500' : ''}
                data-testid="song-tags-input"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {tags.trim().length === 0 && description.trim().length >= 5 ? (
                  <span className="text-red-500">Tags are required to generate a song</span>
                ) : (
                  "Separate tags with commas"
                )}
              </p>
              
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                <Label className="flex items-center text-sm font-semibold">
                  <PenTool className="w-4 h-4 text-accent mr-2" />
                  Lyrics
                </Label>
                <Button
                  onClick={() => generateLyricsMutation.mutate()}
                  disabled={!description.trim() || generateLyricsMutation.isPending}
                  className="bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white text-sm w-full sm:w-auto"
                  size="sm"
                  data-testid="generate-lyrics-button"
                >
                  {generateLyricsMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Lyrics
                    </>
                  )}
                </Button>
              </div>
              <div className="space-y-3">
                <Textarea
                  value={lyrics}
                  onChange={(e) => {
                    const newLyrics = e.target.value;
                    setLyrics(newLyrics);
                    // Check for profanity when lyrics change
                    const profanityResult = checkProfanity(newLyrics);
                    setProfanityCheck(profanityResult);
                  }}
                  placeholder="Enter your lyrics here or click 'Generate Lyrics' to create them automatically..."
                  rows={6}
                  className={`resize-none ${profanityCheck?.isClean === false ? 'border-red-500 focus:border-red-500' : ''}`}
                  data-testid="lyrics-textarea"
                />
                {profanityCheck?.isClean === false && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded-md">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{profanityCheck.category ? getCategoryMessage(profanityCheck.category) : 'Please remove inappropriate content from your lyrics.'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Generated Song Title Display */}
            {songTitle && (
              <div className="mt-3 p-3 bg-primary/10 rounded-md">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-muted-foreground">Generated Song Title:</span>
                  <span className="font-bold text-primary">{songTitle}</span>
                </div>
              </div>
            )}

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

            {/* Requirements indicator */}
            {(description.trim().length > 0 || tags.trim().length > 0) && !canGenerate && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-md p-3">
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  <i className="fas fa-info-circle mr-2"></i>
                  To generate a song, you need:
                  <span className="block mt-1 ml-6">
                    {description.trim().length < 5 && (
                      <span className="block">• At least 5 characters in description (currently: {description.trim().length})</span>
                    )}
                    {tags.trim().length === 0 && (
                      <span className="block">• At least one tag</span>
                    )}
                  </span>
                </p>
              </div>
            )}

            <Button
              onClick={() => {
                // Check for profanity in description
                if (descriptionProfanityCheck?.isClean === false) {
                  toast({
                    title: "Content Policy Violation",
                    description: descriptionProfanityCheck.category ? getCategoryMessage(descriptionProfanityCheck.category) : "Please remove inappropriate content from your description before generating.",
                    variant: "destructive",
                  });
                  return;
                }
                // Check for profanity in lyrics
                if (profanityCheck?.isClean === false) {
                  toast({
                    title: "Content Policy Violation",
                    description: profanityCheck.category ? getCategoryMessage(profanityCheck.category) : "Please remove inappropriate content from your lyrics before generating.",
                    variant: "destructive",
                  });
                  return;
                }
                generateSongMutation.mutate();
              }}
              disabled={!canGenerate || generateSongMutation.isPending || !hasEnoughCredits || (profanityCheck?.isClean === false) || (descriptionProfanityCheck?.isClean === false)}
              className="w-full floating-button"
              data-testid="generate-song-button"
              title={
                descriptionProfanityCheck?.isClean === false
                  ? "Please remove inappropriate content from your description"
                  : profanityCheck?.isClean === false
                    ? "Please remove inappropriate content from your lyrics" 
                    : !canGenerate 
                      ? "Please enter at least 5 characters in description and add at least one tag" 
                      : !hasEnoughCredits 
                        ? "Not enough credits for this video duration" 
                        : "Generate your AI song"
              }
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Song
            </Button>
            
            {/* Credit Info/Warning Message */}
            <div className="mt-3">
              {!hasEnoughCredits ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3">
                  <p className="text-sm text-red-600 dark:text-red-400 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                    Credits Required to Generate Video: {totalCreditsNeeded.toLocaleString()} (You have {userCreditsRemaining.toLocaleString()} remaining)
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center">
                  Credits Required to Generate Video: {totalCreditsNeeded.toLocaleString()}
                </p>
              )}
            </div>
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
                <p className="text-muted-foreground mb-2">Processing audio file...</p>
              ) : (
                <>
                  <p className="text-muted-foreground mb-2">Drag and drop your audio file here</p>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                </>
              )}
              <p className="text-xs text-muted-foreground mt-2">Supports MP3, WAV, AAC (Max 10MB)</p>
            </div>
            
            {/* Upload Progress */}
            {isUploading && (
              <div className="bg-muted/30 rounded-lg p-4" data-testid="upload-progress">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold">{uploadStatus}</span>
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
                <Progress value={uploadProgress} className="mb-2" />
                <p className="text-sm text-muted-foreground">
                  {uploadProgress < 50 ? "Uploading your audio file..." :
                   uploadProgress < 95 ? "Processing audio file..." :
                   "Finalizing..."}
                </p>
              </div>
            )}
            
            {/* Upload Info */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-md p-3">
              <p className="text-sm text-blue-600 dark:text-blue-400 flex items-start">
                <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                <span>
                  Upload your audio file and we'll automatically detect its duration. Maximum allowed: <strong>3 minutes</strong>. The number of scenes will be determined by your audio length (10 seconds per scene).
                  {!isPaidUser && (
                    <span className="block mt-1 text-orange-600 dark:text-orange-400">• Free plan users: maximum 2 minutes</span>
                  )}
                </span>
              </p>
            </div>
            
            {/* Song Description for Upload */}
            <div>
              <Label className="flex items-center text-sm font-semibold mb-2">
                <Lightbulb className="w-4 h-4 text-accent mr-2" />
                What is your song about?
              </Label>
              <Textarea
                value={uploadSongDescription}
                onChange={(e) => setUploadSongDescription(e.target.value)}
                placeholder="e.g., A lonely cowboy cat riding through the desert at sunset..."
                rows={3}
                className="resize-none"
                data-testid="upload-song-description-input"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Describe the theme, mood, or story of your song - this will help generate relevant video scenes
              </p>
            </div>
            
            {/* Song Title for Upload */}
            <div>
              <Label className="flex items-center text-sm font-semibold mb-2">
                <i className="fas fa-music text-primary mr-2"></i>
                Song Title
              </Label>
              <Input
                value={uploadSongTitle}
                onChange={(e) => setUploadSongTitle(e.target.value)}
                placeholder="Enter a title for your uploaded song..."
                className="w-full"
                data-testid="upload-song-title-input"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Give your uploaded song a memorable title
              </p>
            </div>
            
            
            {/* Video Settings Toggles for Upload */}
            <div className="flex flex-wrap gap-6 py-3 px-4 bg-muted/30 rounded-lg">
              {/* Add Subtitles Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={uploadAddSubtitles}
                  onCheckedChange={setUploadAddSubtitles}
                  data-testid="upload-subtitles-toggle"
                />
                <Label className="text-sm font-medium cursor-pointer" onClick={() => setUploadAddSubtitles(!uploadAddSubtitles)}>
                  Add Subtitles
                </Label>
              </div>

              {/* Watermark Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={includeWatermark}
                  onCheckedChange={setIncludeWatermark}
                  data-testid="upload-watermark-toggle"
                  disabled={!isPremiumUser}
                />
                <Label className="text-sm font-medium cursor-pointer" onClick={() => isPremiumUser && setIncludeWatermark(!includeWatermark)}>
                  Watermark
                </Label>
              </div>

              {/* Public Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                  data-testid="upload-privacy-toggle"
                  disabled={!isPremiumUser}
                />
                <Label className="text-sm font-medium cursor-pointer" onClick={() => isPremiumUser && setIsPublic(!isPublic)}>
                  Public
                </Label>
              </div>

              {/* Aspect Ratio Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={isVertical}
                  onCheckedChange={setIsVertical}
                  data-testid="upload-aspect-ratio-toggle"
                />
                <Label className="text-sm font-medium cursor-pointer" onClick={() => setIsVertical(!isVertical)}>
                  {isVertical ? "Vertical (3:4)" : "Horizontal (16:9)"}
                </Label>
              </div>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.aac,audio/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
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
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(song.createdAt), "MMM d, yyyy")}
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                {formatDuration(song.duration)}
                              </div>
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
                
                {/* Song Title for Library */}
                {selectedSongId && (
                  <div>
                    <Label className="flex items-center text-sm font-semibold mb-2">
                      <i className="fas fa-music text-primary mr-2"></i>
                      Song Title
                    </Label>
                    <Input
                      value={librarySongTitle}
                      onChange={(e) => setLibrarySongTitle(e.target.value)}
                      placeholder="Enter a custom title for this song (optional)..."
                      className="w-full"
                      data-testid="library-song-title-input"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Leave empty to use the original song title
                    </p>
                  </div>
                )}
                
                {/* Video Settings Toggles for Library */}
                <div className="flex flex-wrap gap-6 py-3 px-4 bg-muted/30 rounded-lg">
                  {/* Add Subtitles Toggle */}
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={addSubtitles}
                      onCheckedChange={setAddSubtitles}
                      data-testid="library-subtitles-toggle"
                    />
                    <Label className="text-sm font-medium cursor-pointer" onClick={() => setAddSubtitles(!addSubtitles)}>
                      Add Subtitles
                    </Label>
                  </div>

                  {/* Watermark Toggle */}
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={includeWatermark}
                      onCheckedChange={setIncludeWatermark}
                      data-testid="library-watermark-toggle"
                      disabled={!isPremiumUser}
                    />
                    <Label className="text-sm font-medium cursor-pointer" onClick={() => isPremiumUser && setIncludeWatermark(!includeWatermark)}>
                      Watermark
                    </Label>
                  </div>

                  {/* Public Toggle */}
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={isPublic}
                      onCheckedChange={setIsPublic}
                      data-testid="library-privacy-toggle"
                      disabled={!isPremiumUser}
                    />
                    <Label className="text-sm font-medium cursor-pointer" onClick={() => isPremiumUser && setIsPublic(!isPublic)}>
                      Public
                    </Label>
                  </div>

                  {/* Aspect Ratio Toggle */}
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={isVertical}
                      onCheckedChange={setIsVertical}
                      data-testid="library-aspect-ratio-toggle"
                    />
                    <Label className="text-sm font-medium cursor-pointer" onClick={() => setIsVertical(!isVertical)}>
                      {isVertical ? "Vertical (3:4)" : "Horizontal (16:9)"}
                    </Label>
                  </div>
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
        <div className="flex flex-col items-center gap-3 mt-8 px-4">
          <Button
            onClick={onNext}
            disabled={!currentAudioUrl}
            className={`floating-button text-sm sm:text-lg py-3 px-6 sm:px-8 ${currentAudioUrl ? 'button-glow' : ''}`}
            data-testid="continue-to-character-button"
          >
            Continue to Character
          </Button>
          <StepCircles currentStep={1} />
        </div>
      </div>

      {/* Song Selection Modal */}
      <Dialog open={showSongSelection} onOpenChange={setShowSongSelection}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold gradient-text">Choose Your Favorite Song</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              We generated {generatedSongs.length} songs for you. Select the one you like best!
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-6">
            {generatedSongs.map((song, index) => (
              <Card 
                key={index}
                className={`cursor-pointer transition-all ${
                  selectedGeneratedSongIndex === index 
                    ? 'border-primary ring-2 ring-primary/20' 
                    : 'hover:border-primary/50'
                }`}
                onClick={() => setSelectedGeneratedSongIndex(index)}
                data-testid={`generated-song-option-${index}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        {selectedGeneratedSongIndex === index && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                        <h3 className="font-semibold text-lg">{song.title}</h3>
                        <span className="text-sm bg-primary/20 text-primary px-2 py-1 rounded">
                          Song {index + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {Math.round(song.duration || 0)}s
                        </div>
                      </div>
                      <audio
                        src={song.audioUrl}
                        controls
                        className="w-full"
                        data-testid={`generated-song-audio-${index}`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="flex gap-3 mt-6">
            <Button 
              variant="outline"
              onClick={() => setShowSongSelection(false)}
              className="flex-1"
              data-testid="cancel-song-selection"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => selectGeneratedSongMutation.mutate(selectedGeneratedSongIndex)}
              disabled={selectGeneratedSongMutation.isPending}
              className="flex-1 floating-button"
              data-testid="confirm-song-selection"
            >
              {selectGeneratedSongMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Selecting...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Use This Song
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}