import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "@/components/ui/audio-player";
import { AudioTrimInterface } from "@/components/ui/audio-trim-interface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Upload, Music, Library, Calendar, Tag, Check, Play, RotateCcw, Lightbulb, Tags, PenTool, Sparkles, Loader2, Clock, X, Subtitles, AlertCircle, Eye, EyeOff, Save, Scissors, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { checkProfanity, getCategoryMessage, type ProfanityCheckResult } from "@/lib/profanity-filter";
import { StepCircles } from "@/components/ui/step-circles";
import {
  defaultSubtitleStyle,
  isSubtitleStyle,
  subtitleStyleOptions,
  type SubtitleStyle,
} from "@shared/subtitleStyles";

interface AudioCreationStepProps {
  projectId: string;
  audioUrl?: string;
  aspectRatio?: string;
  projectAddSubtitles?: boolean;
  projectSubtitleStyle?: string;
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
  subtitleStyle?: string | null;
  subtitleFileUrl?: string | null;
  kieTaskId?: string | null;
  kieAudioId?: string | null;
  createdAt: string;
  updatedAt: string;
}

const suggestedTags = ["pop", "electronic", "rock", "upbeat", "hip-hop", "country", "reggae", "synthwave", "kpop", "female singer", "male singer"];

export function AudioCreationStep({ projectId, audioUrl, aspectRatio, projectAddSubtitles, projectSubtitleStyle, projectIncludeWatermark, projectIsPublic, onNext, onReset }: AudioCreationStepProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Check if user is paid (has a plan with monthly price > 0)
  const isPaidUser = user?.plan && user.plan.monthlyPrice > 0;
  
  // Check if user is Premium (can disable watermark)
  const isPremiumUser = user?.plan?.name === "Premium";
  
  // Duration options based on user plan
  const durationOptions = isPaidUser 
    ? [30, 60, 90, 120, 150, 180, 210, 240]
    : [30]; // Free users can only make 30 second videos
  
  const maxDuration = isPaidUser ? 240 : 30; // Paid users: 4 minutes, Free users: 30 seconds
  
  const getDurationLabel = (value: number) => {
    if (value === 30) return "30 sec";
    if (value === 60) return "1 min";
    if (value === 90) return "1.5 min";
    if (value === 120) return "2 min";
    if (value === 150) return "2.5 min";
    if (value === 180) return "3 min";
    if (value === 210) return "3.5 min";
    if (value === 240) return "4 min";
    return `${value} sec`;
  };
  const [currentAudioUrl, setCurrentAudioUrl] = useState(audioUrl);
  const [activeTab, setActiveTab] = useState("generate");
  
  // Track actual song duration after generation (may differ from requested duration)
  // Declared early so it can be used in useEffect hooks
  const [actualSongDuration, setActualSongDuration] = useState<number | null>(null);
  
  // Fetch project data to get audioDuration if audioUrl exists
  const { data: projectData } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!audioUrl && !actualSongDuration, // Only fetch if we have audioUrl but no duration yet
  });
  
  // Set duration from project data if available
  useEffect(() => {
    if (projectData?.audioDuration && !actualSongDuration) {
      setActualSongDuration(projectData.audioDuration);
    }
  }, [projectData?.audioDuration, actualSongDuration]);
  
  // Upload tab state
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(""); // Status message for upload progress
  const [uploadSongTitle, setUploadSongTitle] = useState(""); // Song title for upload tab
  const [uploadSongDescription, setUploadSongDescription] = useState(""); // Song description for upload tab
  const [uploadAddSubtitles, setUploadAddSubtitles] = useState(true); // Subtitle toggle for uploaded songs - enabled by default
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Trim interface state (for upload tab)
  const [showTrimInterface, setShowTrimInterface] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [previewAudioDuration, setPreviewAudioDuration] = useState<number>(0);
  const [isTrimming, setIsTrimming] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  
  // Trim interface state (for generate tab - after song selection)
  const [showTrimInterfaceForGenerated, setShowTrimInterfaceForGenerated] = useState(false);
  const [selectedGeneratedSongForTrim, setSelectedGeneratedSongForTrim] = useState<GeneratedSong | null>(null);
  
  // Generate tab state
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [songTitle, setSongTitle] = useState(""); // Song title for generate tab
  // Duration removed - user will trim after song selection
  const [addSubtitles, setAddSubtitles] = useState(true); // Subtitle toggle - enabled by default in all tabs
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(
    isSubtitleStyle(projectSubtitleStyle) ? projectSubtitleStyle : defaultSubtitleStyle
  );
  const [includeWatermark, setIncludeWatermark] = useState(projectIncludeWatermark ?? true); // Watermark toggle - hydrated from project or default to enabled
  const [isPublic, setIsPublic] = useState(projectIsPublic ?? true); // Privacy toggle - hydrated from project or default to public
  // Default to vertical (3:4) - only use horizontal (16:9) if aspectRatio is explicitly "16:9"
  const [isVertical, setIsVertical] = useState(true); // Always default to vertical (3:4)
  const [progress, setProgress] = useState(0);
  const hasInitializedFromProps = useRef(false);
  const [showCaptionStyles, setShowCaptionStyles] = useState(false); // Control visibility of caption styles picker for Generate tab
  const [showUploadCaptionStyles, setShowUploadCaptionStyles] = useState(false); // Control visibility of caption styles picker for Upload tab
  const [showLibraryCaptionStyles, setShowLibraryCaptionStyles] = useState(false); // Control visibility of caption styles picker for Library tab
  
  // Hydrate state from project props when component mounts or props change
  // Only update from aspectRatio prop if this is an existing project (has audioUrl)
  // For new projects, always default to vertical regardless of aspectRatio value
  useEffect(() => {
    // If project has audioUrl, it's an existing project - respect saved aspectRatio
    if (audioUrl && (aspectRatio === "3:4" || aspectRatio === "16:9")) {
      setIsVertical(aspectRatio === "3:4");
      hasInitializedFromProps.current = true;
    }
    // For new projects (no audioUrl), keep default vertical and don't update from prop
    // This ensures new projects always start with vertical, even if aspectRatio is "16:9" in DB
  }, [aspectRatio, audioUrl]);
  
  // Only respect projectAddSubtitles if this is an existing project (has audioUrl)
  // For new projects, always default to true (enabled)
  // This ensures the toggle stays enabled by default even when project data loads
  useEffect(() => {
    // Only update if this is an existing project with audio AND projectAddSubtitles is explicitly false
    // Otherwise, keep the default of true
    if (audioUrl && projectAddSubtitles === false) {
      setAddSubtitles(false);
    } else if (!audioUrl) {
      // For new projects, always ensure it's true
      setAddSubtitles(true);
    }
  }, [projectAddSubtitles, audioUrl]);

  useEffect(() => {
    if (isSubtitleStyle(projectSubtitleStyle)) {
      setSubtitleStyle(projectSubtitleStyle);
    }
  }, [projectSubtitleStyle]);
  
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
  
  // Library tab state
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [librarySongTitle, setLibrarySongTitle] = useState(""); // Custom title for library song
  const [librarySongDescription, setLibrarySongDescription] = useState(""); // Song description for library tab
  const [libraryDescriptionProfanityCheck, setLibraryDescriptionProfanityCheck] = useState<ProfanityCheckResult | null>(null);
  const [showTrimInterfaceForLibrary, setShowTrimInterfaceForLibrary] = useState(false);
  const [selectedLibrarySongForTrim, setSelectedLibrarySongForTrim] = useState<GeneratedSong | null>(null);
  const libraryTrimInterfaceRef = useRef<HTMLDivElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  
  // Calculate credit costs based on duration
  // Song generation is free, only video generation costs credits
  const getVideoCreditCost = (durationSeconds: number) => {
    // Pricing: 1000 credits for every 30 seconds of video (rounded down, minimum 1000)
    const units = Math.floor(durationSeconds / 30);
    return Math.max(units, 1) * 1000; // Minimum 1000 credits
  };
  
    // Use actual song duration if available (after generation/trimming), otherwise default to 30s
    const effectiveDuration = actualSongDuration ?? 30;
    const totalCreditsNeeded = getVideoCreditCost(effectiveDuration);
  const userCreditsRemaining = user?.creditsRemaining || 0;
  const hasEnoughCredits = userCreditsRemaining >= totalCreditsNeeded;

  // Helper function to check if description is valid based on active tab
  const isDescriptionValid = () => {
    if (activeTab === "generate") {
      return description.trim().length >= 3 && (descriptionProfanityCheck?.isClean !== false);
    } else if (activeTab === "upload") {
      return uploadSongDescription.trim().length >= 3;
    } else if (activeTab === "library") {
      return librarySongDescription.trim().length >= 3 && (libraryDescriptionProfanityCheck?.isClean !== false);
    }
    return false;
  };

  // Fetch user's songs for library tab
  const { data: songs = [], isLoading: songsLoading } = useQuery<GeneratedSong[]>({
    queryKey: ["/api/my-songs"],
    enabled: activeTab === "library",
  });

  // Trim audio mutation
  const trimAudioMutation = useMutation({
    mutationFn: async ({ audioUrl, startTime, endTime, title, description, addSubtitles, subtitleStyle, lyrics, sourceSubtitleFileUrl }: { 
      audioUrl: string; 
      startTime: number; 
      endTime: number;
      title?: string;
      description?: string;
      addSubtitles?: boolean;
      subtitleStyle?: SubtitleStyle;
      lyrics?: string | null;
      sourceSubtitleFileUrl?: string | null;
    }) => {
      setUploadProgress(50);
      setUploadStatus("Trimming audio...");
      const response = await apiRequest("POST", `/api/projects/${projectId}/trim-audio`, {
        audioUrl,
        startTime,
        endTime,
        title: title || uploadSongTitle.trim() || undefined,
        description: description || uploadSongDescription.trim() || undefined,
        addSubtitles,
        subtitleStyle,
        lyrics: lyrics ?? null,
        sourceSubtitleFileUrl: sourceSubtitleFileUrl ?? null,
      });
      return response.json();
    },
    onSuccess: async (data) => {
      setUploadProgress(80);
      setUploadStatus("Finalizing...");
      
      // After trimming, update the project with the trimmed audio
      try {
        // Determine if this is for upload, generated song, or library song
        const isGeneratedSong = !!selectedGeneratedSongForTrim;
        const isLibrarySong = !!selectedLibrarySongForTrim;
        
        // Use select-song endpoint to update project (it handles all the project updates)
        // Don't save to library here since this is the trimmed version (already saved by trim-audio endpoint)
        // Use trimmed lyrics from the trim-audio response instead of full lyrics
        const updateResponse = await apiRequest("POST", `/api/projects/${projectId}/select-song`, {
          audioUrl: data.audioUrl,
          audioType: isGeneratedSong ? 'generated' : (isLibrarySong ? 'library' : 'uploaded'),
          duration: data.duration,
          audioPrompt: isGeneratedSong ? (description || null) : (isLibrarySong ? (librarySongDescription.trim() || null) : (uploadSongDescription || null)),
          audioTags: isGeneratedSong ? (tags || null) : (isLibrarySong ? selectedLibrarySongForTrim?.audioTags || null : null),
          audioLyrics: data.lyrics || null, // Use trimmed lyrics from trim-audio response
          subtitleFileUrl: data.subtitleFileUrl || null,
          aspectRatio: isVertical ? "3:4" : "16:9",
          addSubtitles: isGeneratedSong ? (addSubtitles ? 'true' : 'false') : (isLibrarySong ? (addSubtitles ? 'true' : 'false') : (uploadAddSubtitles ? 'true' : 'false')),
          subtitleStyle,
          includeWatermark: includeWatermark ? 'true' : 'false',
          isPublic: isPublic ? 'true' : 'false',
          saveToLibrary: false // Don't save trimmed version here (already saved by trim-audio endpoint)
        });
        
        const updateData = await updateResponse.json();
        
        // Update title if provided
        const titleToUse = isGeneratedSong 
          ? (songTitle.trim() || selectedGeneratedSongForTrim?.title || description || tags)
          : (isLibrarySong 
            ? (librarySongTitle.trim() || selectedLibrarySongForTrim?.title || undefined)
            : uploadSongTitle.trim());
        
        if (titleToUse) {
          await apiRequest("PATCH", `/api/projects/${projectId}`, {
            title: titleToUse
          });
        }
        
        setUploadProgress(100);
        setUploadStatus("Complete!");
        
        setCurrentAudioUrl(data.audioUrl);
        setIsUploading(false);
        setIsTrimming(false);
        setUploadProgress(0);
        setUploadStatus("");
        setShowTrimInterface(false);
        setShowTrimInterfaceForGenerated(false);
        setShowTrimInterfaceForLibrary(false);
        
        // Clean up preview URL (for upload tab)
        if (previewAudioUrl && previewAudioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(previewAudioUrl);
        }
        
        setPreviewAudioUrl(null);
        setPendingFile(null);
        setSelectedGeneratedSongForTrim(null);
        setSelectedLibrarySongForTrim(null);
        
        // Update actual duration
        if (data.duration) {
          setActualSongDuration(data.duration);
        }
        
        const sceneCount = Math.ceil(data.duration / 6);
        let successDescription = `Audio trimmed successfully! Duration: ${Math.floor(data.duration / 60)}:${String(data.duration % 60).padStart(2, '0')} (${sceneCount} scenes will be generated)`;
        
        // Both full and trimmed versions are saved to library
        if (isGeneratedSong) {
          successDescription += ` Both the full and trimmed versions have been saved to your songs library.`;
        } else if (isLibrarySong) {
          successDescription += ` The trimmed audio has been saved to your songs library as a new song.`;
        } else {
          successDescription += ` The trimmed audio has been saved to your songs library.`;
        }
        // Invalidate songs query to refresh library
        queryClient.invalidateQueries({ queryKey: ["/api/my-songs"] });
        
        toast({
          title: "Success",
          description: successDescription,
        });
        
        // Scroll to the "Continue to Character" button after a short delay to ensure DOM has updated
        setTimeout(() => {
          continueButtonRef.current?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }, 100);
      } catch (error) {
        setIsUploading(false);
        setIsTrimming(false);
        toast({
          title: "Update Failed",
          description: (error as Error).message,
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      setIsUploading(false);
      setIsTrimming(false);
      toast({
        title: "Trim Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Upload mutations
  const uploadAudioMutation = useMutation({
    mutationFn: async (file: File, options?: { trimmedAudioUrl?: string }) => {
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
        formData.append('subtitleStyle', subtitleStyle);
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
      setShowTrimInterface(false);
      setPreviewAudioUrl(null);
      setPendingFile(null);
      // Update actual duration from uploaded audio
      if (data.duration) {
        setActualSongDuration(data.duration);
      }
      const sceneCount = Math.ceil(data.duration / 6);
      
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
      // Use a default duration of 120 seconds for lyrics generation (user will trim later)
      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-lyrics`, {
        description,
        duration: 120
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

      // Generate songs with a default duration of 120 seconds (user will trim after selection)
      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-song`, {
        description,
        tags,
        lyrics,
        duration: 120, // Default duration - user will trim after selection
        addSubtitles,
        subtitleStyle,
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
        description: "Failed to generate songs",
        variant: "destructive",
      });
    }
  });

  // Save generated song to library mutation
  const saveSongToLibraryMutation = useMutation({
    mutationFn: async (song: GeneratedSong) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/select-song`, {
        audioUrl: song.audioUrl,
        audioTags: song.audioTags,
        audioLyrics: song.audioLyrics,
        title: song.title,
        duration: song.duration,
        subtitleFileUrl: song.subtitleFileUrl,
        subtitleStyle,
        kieTaskId: song.kieTaskId,
        kieAudioId: song.kieAudioId,
        audioType: "generated",
        aspectRatio: isVertical ? "3:4" : "16:9",
        saveToLibrary: true // Flag to save full version to library
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.savedFullSongToLibrary) {
        toast({
          title: "Success",
          description: "Song saved to your library!",
        });
        // Invalidate songs query to refresh library
        queryClient.invalidateQueries({ queryKey: ["/api/my-songs"] });
      }
    },
    onError: (error) => {
      toast({
        title: "Save Failed",
        description: (error as Error).message,
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
        subtitleStyle,
        kieTaskId: selectedSong.kieTaskId,
        kieAudioId: selectedSong.kieAudioId,
        audioType: "generated",
        aspectRatio: isVertical ? "3:4" : "16:9",
        saveToLibrary: true // Flag to save full version to library
      });
      return response.json();
    },
    onSuccess: (data, songIndex) => {
      // Use the passed songIndex (which is the mutation variable)
      const selectedSong = generatedSongs[songIndex] ?? generatedSongs[selectedGeneratedSongIndex];
      
      // Show trim interface instead of directly selecting
      setSelectedGeneratedSongForTrim(selectedSong);
      setShowTrimInterfaceForGenerated(true);
      setShowSongSelection(false);
      
      // Show message if full song was saved to library
      if (data.savedFullSongToLibrary) {
        toast({
          title: "Song Selected",
          description: "Full version saved to your library. Now select the portion you want to use.",
        });
        // Invalidate songs query to refresh library
        queryClient.invalidateQueries({ queryKey: ["/api/my-songs"] });
      }
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
        subtitleStyle,
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
      
      // Include song description if provided
      if (librarySongDescription.trim()) {
        requestData.audioPrompt = librarySongDescription.trim();
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
  const handleFileSelect = async (file: File) => {
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
    
    // Create preview URL and get duration
    const previewUrl = URL.createObjectURL(file);
    setPendingFile(file);
    
    // Get audio duration for preview
    const audio = new Audio(previewUrl);
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration;
      setPreviewAudioDuration(duration);
      setPreviewAudioUrl(previewUrl);
      setShowTrimInterface(true);
    });
    
    audio.addEventListener('error', () => {
      // If preview fails, just upload directly
      setIsUploading(true);
      uploadAudioMutation.mutate(file);
    });
  };

  const handleTrim = async (startTime: number, endTime: number) => {
    if (!previewAudioUrl || !pendingFile) return;
    
    setIsTrimming(true);
    setIsUploading(true);
    setUploadStatus("Uploading audio file...");
    
    // Upload file first to get a URL for trimming
    const formData = new FormData();
    formData.append('audio', pendingFile);
    if (uploadSongTitle.trim()) {
      formData.append('title', uploadSongTitle.trim());
    }
    if (uploadSongDescription.trim()) {
      formData.append('description', uploadSongDescription.trim());
    }
    formData.append('addSubtitles', 'false'); // Don't generate subtitles yet, we'll do it after trimming
    formData.append('subtitleStyle', subtitleStyle);
    formData.append('aspectRatio', isVertical ? "3:4" : "16:9");
    formData.append('includeWatermark', includeWatermark ? 'true' : 'false');
    formData.append('isPublic', isPublic ? 'true' : 'false');
    
    try {
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete * 0.3); // Upload takes 30% of total progress
          setUploadStatus("Uploading audio file...");
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const uploadData = JSON.parse(xhr.responseText);
            setUploadProgress(30);
            setUploadStatus("Trimming audio...");
            
            // Now trim the uploaded audio
            trimAudioMutation.mutate({
              audioUrl: uploadData.audioUrl,
              startTime,
        endTime,
        addSubtitles: uploadAddSubtitles,
        subtitleStyle,
        lyrics: null,
        sourceSubtitleFileUrl: null,
            });
          } catch (error) {
            setIsUploading(false);
            setIsTrimming(false);
            toast({
              title: "Upload Failed",
              description: 'Failed to parse response',
              variant: "destructive",
            });
          }
        } else {
          setIsUploading(false);
          setIsTrimming(false);
          try {
            const error = JSON.parse(xhr.responseText);
            toast({
              title: "Upload Failed",
              description: error.error || 'Upload failed',
              variant: "destructive",
            });
          } catch {
            toast({
              title: "Upload Failed",
              description: 'Upload failed',
              variant: "destructive",
            });
          }
        }
      });
      
      xhr.addEventListener('error', () => {
        setIsUploading(false);
        setIsTrimming(false);
        toast({
          title: "Upload Failed",
          description: 'Upload failed due to network error',
          variant: "destructive",
        });
      });
      
      xhr.open('POST', `/api/projects/${projectId}/upload-audio`);
      xhr.send(formData);
    } catch (error) {
      setIsUploading(false);
      setIsTrimming(false);
      toast({
        title: "Upload Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleCancelTrim = () => {
    setShowTrimInterface(false);
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
    }
    setPreviewAudioUrl(null);
    setPendingFile(null);
  };

  // Handle trim for generated songs
  const handleTrimGeneratedSong = async (startTime: number, endTime: number) => {
    if (!selectedGeneratedSongForTrim) return;
    
    setIsTrimming(true);
    setUploadProgress(50);
    setUploadStatus("Trimming audio...");
    
    try {
      // Trim the generated song
      trimAudioMutation.mutate({
        audioUrl: selectedGeneratedSongForTrim.audioUrl,
        startTime,
        endTime,
        title: songTitle.trim() || selectedGeneratedSongForTrim.title || undefined,
        description: description.trim() || undefined,
        addSubtitles,
        subtitleStyle,
        lyrics: selectedGeneratedSongForTrim.audioLyrics || lyrics || null,
        sourceSubtitleFileUrl: selectedGeneratedSongForTrim.subtitleFileUrl || null,
      });
    } catch (error) {
      setIsTrimming(false);
      toast({
        title: "Trim Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleCancelTrimGenerated = () => {
    setShowTrimInterfaceForGenerated(false);
    setSelectedGeneratedSongForTrim(null);
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

  const renderSubtitleStylePicker = (isEnabled: boolean, testIdPrefix: string, showStyles: boolean) => {
    if (!isEnabled || !showStyles) return null;

    return (
      <div className="bg-muted/30 border border-border rounded-lg p-4 mt-4">
        <Label className="text-sm font-semibold mb-3 block">Caption Style</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {subtitleStyleOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => setSubtitleStyle(option.value)}
              className={`text-left p-3 rounded-md border transition-colors ${
                subtitleStyle === option.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
              data-testid={`${testIdPrefix}-${option.value}`}
            >
              <div className="text-sm font-medium">{option.label}</div>
              <div className="text-xs text-muted-foreground mt-1">{option.preview}</div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const handleSelectSong = () => {
    const selectedSong = songs.find(s => s.id === selectedSongId);
    if (selectedSong) {
      selectFromLibraryMutation.mutate(selectedSong);
    }
  };

  // Handle trim for library songs
  const handleTrimLibrarySong = async (startTime: number, endTime: number) => {
    if (!selectedLibrarySongForTrim) return;
    
    setIsTrimming(true);
    setUploadProgress(50);
    setUploadStatus("Trimming audio...");
    
    try {
      // If the library song has subtitles, always enable subtitles for trimming
      // This ensures existing subtitles are trimmed to match the trimmed audio
      const shouldAddSubtitles = addSubtitles || !!selectedLibrarySongForTrim.subtitleFileUrl;
      
      // Trim the library song - the trim-audio endpoint will save it as a new song
      trimAudioMutation.mutate({
        audioUrl: selectedLibrarySongForTrim.audioUrl,
        startTime,
        endTime,
        title: librarySongTitle.trim() || selectedLibrarySongForTrim.title || undefined,
        description: librarySongDescription.trim() || undefined,
        addSubtitles: shouldAddSubtitles,
        subtitleStyle,
        lyrics: selectedLibrarySongForTrim.audioLyrics || null,
        sourceSubtitleFileUrl: selectedLibrarySongForTrim.subtitleFileUrl || null,
      });
    } catch (error) {
      setIsTrimming(false);
      toast({
        title: "Trim Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleCancelTrimLibrary = () => {
    setShowTrimInterfaceForLibrary(false);
    setSelectedLibrarySongForTrim(null);
  };

  return (
    <div className="max-w-5xl mx-auto mb-12 bg-card rounded-lg p-2 sm:p-4" data-testid="audio-creation-step">
      <div className="bg-background border border-border rounded-lg p-4 sm:p-8">
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
            {/* Show trim interface if a generated song was selected */}
            {showTrimInterfaceForGenerated && selectedGeneratedSongForTrim && (
              <>
                {/* Song Title Input */}
                <div>
                  <Label className="flex items-center text-sm font-semibold mb-2">
                    <Music className="w-4 h-4 text-accent mr-2" />
                    Song Title (Optional)
                  </Label>
                  <Input
                    value={songTitle}
                    onChange={(e) => setSongTitle(e.target.value)}
                    placeholder="Enter a title for your song..."
                    className="w-full"
                    disabled={isTrimming}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Give your song a memorable title (optional)
                  </p>
                </div>
                
                <AudioTrimInterface
                  audioUrl={selectedGeneratedSongForTrim.audioUrl}
                  audioDuration={selectedGeneratedSongForTrim.duration || 120}
                  onTrim={handleTrimGeneratedSong}
                  onCancel={handleCancelTrimGenerated}
                  isTrimming={isTrimming}
                  isPaidUser={isPaidUser}
                />
              </>
            )}
            
            {/* Show form fields when not in trim interface */}
            {!showTrimInterfaceForGenerated && (
              <div className="space-y-6">
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
                className={`resize-none transition-all duration-300 ${
                  descriptionProfanityCheck?.isClean === false 
                    ? 'border-red-500 focus:border-red-500' 
                    : description.trim().length > 0 && description.trim().length < 3 
                      ? 'border-red-500' 
                      : ''
                } ${
                  description.trim().length < 3 && descriptionProfanityCheck?.isClean !== false
                    ? 'textarea-pink-glow border-pink-500/50 focus:border-pink-500'
                    : ''
                }`}
                data-testid="song-description-input"
                required
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
                ) : description.trim().length > 0 && description.trim().length < 3 ? (
                  <span className="text-red-500">Description must be at least 3 characters (currently: {description.trim().length})</span>
                ) : description.trim().length >= 3 && tags.trim().length === 0 ? (
                  <span className="text-orange-500">Good! Now add at least one tag below to enable generation</span>
                ) : (
                  "Describe the theme, mood, or story of your song (required, minimum 3 characters)"
                )}
              </p>
            </div>


            {/* Subtitles, Watermark & Privacy Toggles - Single row */}
            <div className="flex flex-wrap gap-6">
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
                  {isVertical ? "Portrait" : "Landscape"}
                </Label>
              </div>

              {/* Captions Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={addSubtitles}
                  onCheckedChange={setAddSubtitles}
                  data-testid="subtitles-toggle"
                />
                <Label className="text-sm font-medium cursor-pointer" onClick={() => setAddSubtitles(!addSubtitles)}>
                  Captions
                </Label>
                {addSubtitles && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCaptionStyles(!showCaptionStyles)}
                    className="h-8 px-2 text-xs"
                    data-testid="caption-styles-button"
                  >
                    Styles
                    <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showCaptionStyles ? 'rotate-180' : ''}`} />
                  </Button>
                )}
              </div>
            </div>

            {renderSubtitleStylePicker(addSubtitles, "generate-caption-style", showCaptionStyles)}

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
                  <span className="font-semibold">Generating Songs...</span>
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
                  To generate songs, you need:
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
                        : "Generate your AI songs"
              }
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Songs (Free)
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
              </div>
            )}
          </TabsContent>

          {/* Upload Audio File Tab */}
          <TabsContent value="upload" className="mt-6 space-y-4">
            {showTrimInterface && previewAudioUrl && previewAudioDuration > 0 ? (
              <AudioTrimInterface
                audioUrl={previewAudioUrl}
                audioDuration={previewAudioDuration}
                onTrim={handleTrim}
                onCancel={handleCancelTrim}
                isTrimming={isTrimming}
                isPaidUser={isPaidUser}
              />
            ) : (
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
            )}
            
            {/* Upload Progress - Show when uploading/trimming */}
            {(isUploading || isTrimming) && (
              <div className="bg-muted/30 rounded-lg p-4" data-testid="upload-progress">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold">{uploadStatus || "Processing..."}</span>
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
                <Progress value={uploadProgress} className="mb-2" />
                <p className="text-sm text-muted-foreground">
                  {uploadProgress < 30 ? "Uploading your audio file..." :
                   uploadProgress < 50 ? "Preparing to trim..." :
                   uploadProgress < 80 ? "Trimming audio..." :
                   uploadProgress < 100 ? "Finalizing..." :
                   "Complete!"}
                </p>
              </div>
            )}
            
            {/* Upload Info */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-md p-3">
              <p className="text-sm text-blue-600 dark:text-blue-400 flex items-start">
                <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                <span>
                  Upload your audio file and we'll automatically detect its duration. Maximum allowed: <strong>{isPaidUser ? '4 minutes' : '2 minutes'}</strong>. The number of scenes will be determined by your audio length (6 seconds per scene).
                  {!isPaidUser && (
                    <span className="block mt-1 text-orange-600 dark:text-orange-400">• Free plan users: maximum 2 minutes</span>
                  )}
                </span>
              </p>
            </div>
            
            {/* Song Description for Upload - Show when not in trim interface or when trimming */}
            {(!showTrimInterface || isTrimming) && (
              <>
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
                    className={`resize-none transition-all duration-300 ${
                      uploadSongDescription.trim().length > 0 && uploadSongDescription.trim().length < 3 
                        ? 'border-red-500' 
                        : ''
                    } ${
                      uploadSongDescription.trim().length < 3
                        ? 'textarea-pink-glow border-pink-500/50 focus:border-pink-500'
                        : ''
                    }`}
                    data-testid="upload-song-description-input"
                    disabled={isTrimming}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {uploadSongDescription.trim().length > 0 && uploadSongDescription.trim().length < 3 ? (
                      <span className="text-red-500">Description must be at least 3 characters (currently: {uploadSongDescription.trim().length})</span>
                    ) : (
                      "Describe the theme, mood, or story of your song - this will help generate relevant video scenes (required, minimum 3 characters)"
                    )}
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
                    disabled={isTrimming}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Give your uploaded song a memorable title
                  </p>
                </div>
              </>
            )}
            
            
            {/* Video Settings Toggles for Upload */}
            <div className="flex flex-wrap gap-6 py-3 px-4 bg-muted/30 rounded-lg">
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
                  {isVertical ? "Portrait" : "Landscape"}
                </Label>
              </div>

              {/* Captions Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={uploadAddSubtitles}
                  onCheckedChange={setUploadAddSubtitles}
                  data-testid="upload-subtitles-toggle"
                />
                <Label className="text-sm font-medium cursor-pointer" onClick={() => setUploadAddSubtitles(!uploadAddSubtitles)}>
                  Captions
                </Label>
                {uploadAddSubtitles && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUploadCaptionStyles(!showUploadCaptionStyles)}
                    className="h-8 px-2 text-xs"
                    data-testid="upload-caption-styles-button"
                  >
                    Styles
                    <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showUploadCaptionStyles ? 'rotate-180' : ''}`} />
                  </Button>
                )}
              </div>
            </div>

            {renderSubtitleStylePicker(uploadAddSubtitles, "upload-caption-style", showUploadCaptionStyles)}
            
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
                          <div className="flex gap-2">
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
                            {song.duration && song.duration > 30 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLibrarySongForTrim(song);
                                  setShowTrimInterfaceForLibrary(true);
                                  // Scroll to trim interface after a short delay to ensure it's rendered
                                  setTimeout(() => {
                                  libraryTrimInterfaceRef.current?.scrollIntoView({ 
                                    behavior: 'smooth', 
                                    block: 'center' 
                                  });
                                  }, 100);
                                }}
                                data-testid={`button-trim-${song.id}`}
                              >
                                <Scissors className="h-3 w-3 mr-1" />
                                Trim
                              </Button>
                            )}
                          </div>
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
                
                {/* Trim Interface for Library Songs */}
                {showTrimInterfaceForLibrary && selectedLibrarySongForTrim && (
                  <div ref={libraryTrimInterfaceRef} className="mt-6">
                    <AudioTrimInterface
                      audioUrl={selectedLibrarySongForTrim.audioUrl}
                      audioDuration={selectedLibrarySongForTrim.duration || 0}
                      onTrim={handleTrimLibrarySong}
                      onCancel={handleCancelTrimLibrary}
                      isTrimming={isTrimming}
                      isPaidUser={isPaidUser}
                    />
                  </div>
                )}
                
                {/* Song Description for Library */}
                {(selectedSongId || (currentAudioUrl && activeTab === "library")) && (
                  <div>
                    <Label className="flex items-center text-sm font-semibold mb-2">
                      <Lightbulb className="w-4 h-4 text-accent mr-2" />
                      What is your song about?
                    </Label>
                    <Textarea
                      value={librarySongDescription}
                      onChange={(e) => {
                        const newDescription = e.target.value;
                        setLibrarySongDescription(newDescription);
                        // Check for profanity when description changes
                        const profanityResult = checkProfanity(newDescription);
                        setLibraryDescriptionProfanityCheck(profanityResult);
                      }}
                      placeholder="e.g., A lonely cowboy cat riding through the desert at sunset..."
                      rows={3}
                      className={`resize-none transition-all duration-300 ${
                        libraryDescriptionProfanityCheck?.isClean === false 
                          ? 'border-red-500 focus:border-red-500' 
                          : librarySongDescription.trim().length > 0 && librarySongDescription.trim().length < 3 
                            ? 'border-red-500' 
                            : ''
                      } ${
                        librarySongDescription.trim().length < 3 && libraryDescriptionProfanityCheck?.isClean !== false
                          ? 'textarea-pink-glow border-pink-500/50 focus:border-pink-500'
                          : ''
                      }`}
                      data-testid="library-song-description-input"
                      required
                    />
                    {libraryDescriptionProfanityCheck?.isClean === false && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded-md mt-2">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <span>{libraryDescriptionProfanityCheck.category ? getCategoryMessage(libraryDescriptionProfanityCheck.category) : 'Please remove inappropriate content from your description.'}</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {libraryDescriptionProfanityCheck?.isClean === false ? (
                        <span className="text-red-500">Please remove inappropriate content from your description before proceeding.</span>
                      ) : librarySongDescription.trim().length > 0 && librarySongDescription.trim().length < 3 ? (
                        <span className="text-red-500">Description must be at least 3 characters (currently: {librarySongDescription.trim().length})</span>
                      ) : (
                        "Describe the theme, mood, or story of your song - this will help generate relevant video scenes (required, minimum 3 characters)"
                      )}
                    </p>
                  </div>
                )}
                
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
                      {isVertical ? "Portrait" : "Landscape"}
                    </Label>
                  </div>

                  {/* Captions Toggle */}
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={addSubtitles}
                      onCheckedChange={setAddSubtitles}
                      data-testid="library-subtitles-toggle"
                    />
                    <Label className="text-sm font-medium cursor-pointer" onClick={() => setAddSubtitles(!addSubtitles)}>
                      Captions
                    </Label>
                    {addSubtitles && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowLibraryCaptionStyles(!showLibraryCaptionStyles)}
                        className="h-8 px-2 text-xs"
                        data-testid="library-caption-styles-button"
                      >
                        Styles
                        <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showLibraryCaptionStyles ? 'rotate-180' : ''}`} />
                      </Button>
                    )}
                  </div>
                </div>

                {renderSubtitleStylePicker(addSubtitles, "library-caption-style", showLibraryCaptionStyles)}
                
                {!currentAudioUrl && (
                  <Button 
                    onClick={() => {
                      // Check for profanity in description
                      if (libraryDescriptionProfanityCheck?.isClean === false) {
                        toast({
                          title: "Content Policy Violation",
                          description: libraryDescriptionProfanityCheck.category ? getCategoryMessage(libraryDescriptionProfanityCheck.category) : "Please remove inappropriate content from your description before proceeding.",
                          variant: "destructive",
                        });
                        return;
                      }
                      handleSelectSong();
                    }}
                    disabled={!selectedSongId || (libraryDescriptionProfanityCheck?.isClean === false)}
                    className="w-full floating-button"
                    data-testid="button-select-song"
                    title={
                      libraryDescriptionProfanityCheck?.isClean === false
                        ? "Please remove inappropriate content from your description"
                        : !selectedSongId
                          ? "Please select a song from your library"
                          : "Use the selected song"
                    }
                  >
                    Use Selected Song
                  </Button>
                )}
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

        {/* Credit Cost Display for Library Songs */}
        {currentAudioUrl && actualSongDuration && (
          <div className="mt-6 px-4">
            <p className="text-sm text-muted-foreground text-center">
              Minimum credits to generate a {Math.round(actualSongDuration)} seconds video:{" "}
              <span className="font-semibold text-foreground">
                {getVideoCreditCost(actualSongDuration).toLocaleString()} credits
              </span>
            </p>
          </div>
        )}

        {/* Next Step Button */}
        <div className="flex flex-col items-center gap-3 mt-8 px-4">
          <Button
            ref={continueButtonRef}
            onClick={onNext}
            disabled={!currentAudioUrl || !isDescriptionValid()}
            className={`floating-button text-sm sm:text-lg py-3 px-6 sm:px-8 ${currentAudioUrl && isDescriptionValid() ? 'button-glow' : ''}`}
            data-testid="continue-to-character-button"
            title={!currentAudioUrl ? "Please select or upload an audio file" : !isDescriptionValid() ? "Please enter a description with at least 3 characters" : ""}
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
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          saveSongToLibraryMutation.mutate(song);
                        }}
                        disabled={saveSongToLibraryMutation.isPending}
                        className="flex items-center gap-2"
                        data-testid={`save-song-to-library-${index}`}
                      >
                        {saveSongToLibraryMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            Save to Library
                          </>
                        )}
                      </Button>
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