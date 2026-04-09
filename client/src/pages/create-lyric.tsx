import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Music, Video, Monitor, Smartphone, ArrowLeft, Clock, ChevronDown, CheckCircle2, Edit, Tags, ArrowUp, AlignVerticalSpaceAround, ArrowDown, Sparkles, Check, Save, Upload } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { downloadFileFromUrl } from "@/lib/utils";
import { NavigationHeader } from "@/components/navigation-header";
import { VideoStyleCapabilityNotes } from "@/components/video-style-capability-notes";
import { Footer } from "@/components/footer";
import { useLocation } from "wouter";
import { Project, GenerationLog } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { isFreePlanUser } from "@/lib/plan-utils";
import { FreePlanVideoUpsellAlert } from "@/components/free-plan-video-upsell";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  defaultSubtitleStyle,
  isSubtitleStyle,
  subtitleStyleOptions,
  type SubtitleStyle,
} from "@shared/subtitleStyles";
import {
  popularGoogleFonts,
  defaultGoogleFont,
  isGoogleFont,
  type GoogleFont,
} from "@shared/googleFonts";
import { Progress } from "@/components/ui/progress";
import { AudioTrimInterface } from "@/components/ui/audio-trim-interface";
import { AudioPlayer } from "@/components/ui/audio-player";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type GeneratedSong = {
  id: string;
  title: string;
  audioUrl: string;
  audioTags: string | null;
  audioLyrics: string | null;
  duration: number | null;
  subtitleFileUrl?: string | null;
  kieTaskId?: string | null;
  kieAudioId?: string | null;
};

const suggestedTags = ["pop", "electronic", "rock", "upbeat", "hip-hop", "country", "reggae", "synthwave", "kpop", "female singer", "male singer"];

export default function CreateLyric() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const progressCardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [songSource, setSongSource] = useState<"ai-generated" | "upload">("ai-generated");
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState(false);
  const [tags, setTags] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [addSubtitles, setAddSubtitles] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(defaultSubtitleStyle);
  const [textPosition, setTextPosition] = useState<"top" | "center" | "bottom">("bottom");
  const [fontFamily, setFontFamily] = useState<GoogleFont>(defaultGoogleFont);
  const [showCaptionStyles, setShowCaptionStyles] = useState(false);
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [isVertical, setIsVertical] = useState(true);

  const [songProjectId, setSongProjectId] = useState<string | null>(null);
  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);

  const [progress, setProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isTrimming, setIsTrimming] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showTrimInterfaceForUpload, setShowTrimInterfaceForUpload] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [previewAudioDuration, setPreviewAudioDuration] = useState<number>(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [generatedSongs, setGeneratedSongs] = useState<GeneratedSong[]>([]);
  const [showSongSelection, setShowSongSelection] = useState(false);
  const [selectedGeneratedSongIndex, setSelectedGeneratedSongIndex] = useState(0);
  const [selectedGeneratedSongForTrim, setSelectedGeneratedSongForTrim] = useState<GeneratedSong | null>(null);
  const [showTrimInterfaceForGenerated, setShowTrimInterfaceForGenerated] = useState(false);

  const [trimmedAudioUrl, setTrimmedAudioUrl] = useState<string | null>(null);
  const [trimmedDuration, setTrimmedDuration] = useState<number | null>(null);
  const [trimmedSubtitleFileUrl, setTrimmedSubtitleFileUrl] = useState<string | null>(null);
  const [trimmedLyrics, setTrimmedLyrics] = useState<string | null>(null);

  const isPaidUser = user?.plan && user.plan.monthlyPrice > 0;
  const isPremiumUser = user?.plan?.name === "Premium";

  // Track previous caption settings to detect changes
  const prevCaptionSettings = useRef<{
    subtitleStyle: SubtitleStyle;
    textPosition: "top" | "center" | "bottom";
    fontFamily: GoogleFont;
    addSubtitles: boolean;
  } | null>(null);

  const ensureSongProject = async () => {
    if (songProjectId) return songProjectId;
    const projectResponse = await apiRequest("POST", "/api/projects", {
      title: "Lyric Video",
      description: description.trim() || "AI lyric video project",
      aspectRatio: isVertical ? "3:4" : "16:9",
      currentStep: 1,
      addSubtitles,
      subtitleStyle,
      fontFamily,
      isInstrumental: true,
    });
    const projectData = await projectResponse.json();
    setSongProjectId(projectData.id);
    return projectData.id as string;
  };

  // Re-apply captions when settings change after trimming
  const reapplyCaptionsMutation = useMutation({
    mutationFn: async () => {
      if (!songProjectId) return;
      const response = await apiRequest("POST", `/api/projects/${songProjectId}/reapply-captions`, {
        subtitleStyle,
        textPosition,
        fontFamily,
        addSubtitles,
      });
      return response.json();
    },
    onSuccess: () => {
      // Silently update - user doesn't need a toast for every setting change
    },
    onError: (error) => {
      console.error("Failed to re-apply captions:", error);
      // Don't show error toast - this is a background operation
    },
  });

  // Detect caption setting changes after trimming
  useEffect(() => {
    // Only re-apply if:
    // 1. We have trimmed audio (trimmedAudioUrl exists)
    // 2. We have a project ID
    // 3. We have previous settings to compare (not initial mount)
    // 4. Settings have actually changed
    const hasTrimmedAudio = trimmedAudioUrl !== null;
    
    if (!hasTrimmedAudio || !songProjectId || !prevCaptionSettings.current) {
      // Update previous settings for next comparison
      prevCaptionSettings.current = {
        subtitleStyle,
        textPosition,
        fontFamily,
        addSubtitles,
      };
      return;
    }

    const prev = prevCaptionSettings.current;
    const hasChanged = 
      prev.subtitleStyle !== subtitleStyle ||
      prev.textPosition !== textPosition ||
      prev.fontFamily !== fontFamily ||
      prev.addSubtitles !== addSubtitles;

    if (hasChanged) {
      // Debounce: wait a bit before re-applying to avoid too many calls
      const timeoutId = setTimeout(() => {
        reapplyCaptionsMutation.mutate();
      }, 500);

      // Update previous settings
      prevCaptionSettings.current = {
        subtitleStyle,
        textPosition,
        fontFamily,
        addSubtitles,
      };

      return () => clearTimeout(timeoutId);
    }
  }, [subtitleStyle, textPosition, fontFamily, addSubtitles, trimmedAudioUrl, songProjectId]);

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", generatedProjectId],
    enabled: !!generatedProjectId,
    refetchInterval: 5000,
  });

  const { data: generationLogs } = useQuery<GenerationLog[]>({
    queryKey: ["/api/projects", generatedProjectId, "logs"],
    enabled: !!generatedProjectId,
    refetchInterval: (query) => {
      const logs = query.state.data || [];
      return logs.length > 0 ? 1000 : 2000;
    },
    queryFn: async () => {
      if (!generatedProjectId) return [];
      const response = await apiRequest("GET", `/api/projects/${generatedProjectId}/logs`);
      return response.json();
    },
  });

  const generateLyricsMutation = useMutation({
    mutationFn: async () => {
      const projectId = await ensureSongProject();
      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-lyrics`, {
        description,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setLyrics(data.lyrics || "");
      setSongTitle(data.title || "");
      toast({
        title: "Success",
        description: "Lyrics generated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate lyrics",
        variant: "destructive",
      });
    },
  });

  const generateSongMutation = useMutation({
    mutationFn: async () => {
      const projectId = await ensureSongProject();
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
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
        songTitle,
        addSubtitles,
        subtitleStyle,
        includeWatermark,
        isPublic,
        aspectRatio: isVertical ? "3:4" : "16:9",
      });

      clearInterval(progressInterval);
      setProgress(100);
      return response.json();
    },
    onSuccess: (data) => {
      setProgress(0);
      if (data?.songs?.length) {
        setGeneratedSongs(data.songs);
        setSelectedGeneratedSongIndex(0);
        setShowSongSelection(true);
        toast({
          title: "Songs Ready",
          description: `Generated ${data.songs.length} songs. Choose one to trim.`,
        });
      } else {
        toast({
          title: "Error",
          description: "No songs were returned by generation.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      setProgress(0);
      toast({
        title: "Error",
        description: "Failed to generate songs",
        variant: "destructive",
      });
    },
  });

  const saveSongToLibraryMutation = useMutation({
    mutationFn: async (song: GeneratedSong) => {
      const projectId = await ensureSongProject();
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
        saveToLibrary: true,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Saved",
        description: "Song saved to your library.",
      });
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Could not save this song to your library.",
        variant: "destructive",
      });
    },
  });

  const selectGeneratedSongMutation = useMutation({
    mutationFn: async (songIndex: number) => {
      const projectId = await ensureSongProject();
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
        includeWatermark,
        isPublic,
        addSubtitles,
        saveToLibrary: true,
      });
      return response.json();
    },
    onSuccess: (_, songIndex) => {
      const selectedSong = generatedSongs[songIndex] ?? generatedSongs[selectedGeneratedSongIndex];
      setSelectedGeneratedSongForTrim(selectedSong);
      setShowTrimInterfaceForGenerated(true);
      setShowSongSelection(false);
      toast({
        title: "Song Selected",
        description: "Now trim your song before generating the lyric video.",
      });
    },
    onError: () => {
      toast({
        title: "Selection Failed",
        description: "Could not select this song.",
        variant: "destructive",
      });
    },
  });

  const trimAudioMutation = useMutation({
    mutationFn: async ({ audioUrl, startTime, endTime }: { audioUrl: string; startTime: number; endTime: number }) => {
      const projectId = await ensureSongProject();
      setUploadProgress(50);
      setUploadStatus("Trimming audio...");
      const response = await apiRequest("POST", `/api/projects/${projectId}/trim-audio`, {
        audioUrl,
        startTime,
        endTime,
        title: songTitle.trim() || selectedGeneratedSongForTrim?.title || undefined,
        description: description.trim() || undefined,
        addSubtitles,
        subtitleStyle,
        lyrics: selectedGeneratedSongForTrim?.audioLyrics || lyrics || null,
        sourceSubtitleFileUrl: selectedGeneratedSongForTrim?.subtitleFileUrl || null,
      });
      const trimData = await response.json();

      await apiRequest("POST", `/api/projects/${projectId}/select-song`, {
        audioUrl: trimData.audioUrl,
        audioType: "generated",
        duration: trimData.duration,
        audioPrompt: description.trim() || null,
        audioTags: tags || null,
        audioLyrics: trimData.lyrics || selectedGeneratedSongForTrim?.audioLyrics || lyrics || null,
        subtitleFileUrl: trimData.subtitleFileUrl || null,
        aspectRatio: isVertical ? "3:4" : "16:9",
        addSubtitles: isPremiumUser && addSubtitles ? "true" : "false",
        subtitleStyle,
        includeWatermark: includeWatermark ? "true" : "false",
        isPublic: isPublic ? "true" : "false",
        saveToLibrary: false,
      });

      return trimData;
    },
    onSuccess: (data) => {
      setUploadProgress(100);
      setUploadStatus("Complete!");
      setTrimmedAudioUrl(data.audioUrl);
      setTrimmedDuration(data.duration || null);
      setTrimmedSubtitleFileUrl(data.subtitleFileUrl || null);
      setTrimmedLyrics(data.lyrics || null);
      if (data.lyrics && data.lyrics.trim().length > 0) {
        setLyrics(data.lyrics);
      }
      setShowTrimInterfaceForGenerated(false);
      setSelectedGeneratedSongForTrim(null);
      setIsTrimming(false);
      setTimeout(() => {
        setUploadProgress(0);
        setUploadStatus("");
      }, 800);
      toast({
        title: "Audio Trimmed",
        description: "Your trimmed song is ready. Generate the lyric video when ready.",
      });
    },
    onError: () => {
      setIsTrimming(false);
      toast({
        title: "Trim Failed",
        description: "Could not trim this song.",
        variant: "destructive",
      });
    },
  });

  const generateVideoMutation = useMutation({
    mutationFn: async () => {
      if (description.trim().length === 0) {
        setDescriptionError(true);
        throw new Error("Please describe what your song is about before generating the video.");
      }
      const projectId = await ensureSongProject();
      if (!trimmedAudioUrl || !trimmedDuration) {
        throw new Error("Please generate and trim a song first.");
      }
      
      // Re-apply captions with current settings before generating
      if (songProjectId) {
        try {
          await reapplyCaptionsMutation.mutateAsync();
        } catch (error) {
          // Continue anyway even if reapply fails
          console.error("Failed to re-apply captions, continuing anyway:", error);
        }
      }
      
      const captionText = (trimmedLyrics || lyrics || "").trim();
      const response = await apiRequest("POST", "/api/instrumental", {
        description,
        tags: tags || "lyric",
        aspectRatio: isVertical ? "3:4" : "16:9",
        duration: trimmedDuration,
        textOverlay: isPremiumUser && addSubtitles && !trimmedSubtitleFileUrl && captionText.length > 0 ? captionText : undefined,
        textPosition,
        addSubtitles: isPremiumUser && addSubtitles,
        subtitleStyle,
        fontFamily,
        audioUrl: trimmedAudioUrl,
        projectId,
        subtitleFileUrl: isPremiumUser && addSubtitles ? trimmedSubtitleFileUrl || undefined : undefined,
        isLyricVideo: true, // Flag to indicate this is a lyric video (not instrumental)
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.projectId) {
        setGeneratedProjectId(data.projectId);
      }
      toast({
        title: "Video Generation Started",
        description: data.message || "Your lyric video is being generated.",
      });
      setTimeout(() => {
        if (progressCardRef.current) {
          progressCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 150);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to generate lyric video",
        variant: "destructive",
      });
    },
  });

  const handleTrimGeneratedSong = (startTime: number, endTime: number) => {
    if (!selectedGeneratedSongForTrim) return;
    setIsTrimming(true);
    trimAudioMutation.mutate({
      audioUrl: selectedGeneratedSongForTrim.audioUrl,
      startTime,
      endTime,
    });
  };

  const handleAudioUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (file: File) => {
    const allowedTypes = ["audio/mpeg", "audio/wav", "audio/aac", "audio/mp3"];
    const isValidType = allowedTypes.includes(file.type) || file.name.match(/\.(mp3|wav|aac)$/i);
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

    const url = URL.createObjectURL(file);
    setPendingFile(file);
    const audio = new Audio(url);
    audio.addEventListener("loadedmetadata", () => {
      setPreviewAudioDuration(audio.duration);
      setPreviewAudioUrl(url);
      setShowTrimInterfaceForUpload(true);
    });
    audio.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      setPendingFile(null);
      toast({
        title: "Error",
        description: "Failed to load audio file. Please try another file.",
        variant: "destructive",
      });
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
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
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleCancelUploadTrim = () => {
    setShowTrimInterfaceForUpload(false);
    if (previewAudioUrl && previewAudioUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewAudioUrl);
    }
    setPreviewAudioUrl(null);
    setPendingFile(null);
  };

  const handleTrimUploadedSong = async (startTime: number, endTime: number) => {
    if (!pendingFile) return;
    setIsTrimming(true);
    setIsUploading(true);
    setUploadStatus("Uploading audio file...");
    setUploadProgress(10);

    try {
      const projectId = await ensureSongProject();
      const formData = new FormData();
      formData.append("audio", pendingFile);
      formData.append("addSubtitles", "false");
      formData.append("subtitleStyle", subtitleStyle);
      formData.append("aspectRatio", isVertical ? "3:4" : "16:9");

      const uploadData = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(Math.max(10, Math.round(percentComplete * 0.3)));
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || "Upload failed"));
            } catch {
              reject(new Error("Upload failed"));
            }
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed due to network error")));
        xhr.open("POST", `/api/projects/${projectId}/upload-audio`);
        xhr.send(formData);
      });

      setUploadStatus("Trimming audio...");
      const trimResponse = await apiRequest("POST", `/api/projects/${projectId}/trim-audio`, {
        audioUrl: uploadData.audioUrl,
        startTime,
        endTime,
        title: songTitle.trim() || undefined,
        description: description.trim() || undefined,
        addSubtitles: isPremiumUser && addSubtitles,
        subtitleStyle,
        lyrics: uploadData.lyrics || null,
        sourceSubtitleFileUrl: null,
      });
      const trimData = await trimResponse.json();

      await apiRequest("POST", `/api/projects/${projectId}/select-song`, {
        audioUrl: trimData.audioUrl,
        audioType: "uploaded",
        duration: trimData.duration,
        audioPrompt: description.trim() || null,
        audioTags: null,
        audioLyrics: trimData.lyrics || lyrics || null,
        subtitleFileUrl: trimData.subtitleFileUrl || null,
        aspectRatio: isVertical ? "3:4" : "16:9",
        addSubtitles: isPremiumUser && addSubtitles ? "true" : "false",
        subtitleStyle,
        includeWatermark: includeWatermark ? "true" : "false",
        isPublic: isPublic ? "true" : "false",
        saveToLibrary: false,
      });

      setTrimmedAudioUrl(trimData.audioUrl);
      setTrimmedDuration(trimData.duration || null);
      setTrimmedSubtitleFileUrl(trimData.subtitleFileUrl || null);
      setTrimmedLyrics(trimData.lyrics || null);
      if (trimData.lyrics && trimData.lyrics.trim().length > 0) {
        setLyrics(trimData.lyrics);
      }
      handleCancelUploadTrim();
      setUploadStatus("Complete!");
      setUploadProgress(100);
      setTimeout(() => {
        setUploadStatus("");
        setUploadProgress(0);
      }, 800);
      toast({
        title: "Audio Trimmed",
        description: "Uploaded song trimmed successfully. You can now generate the lyric video.",
      });
    } catch (error: any) {
      toast({
        title: "Upload/Trim Failed",
        description: error?.message || "Failed to upload and trim audio",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setIsTrimming(false);
    }
  };

  const addTag = (tag: string) => {
    const currentTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (!currentTags.includes(tag)) {
      setTags(currentTags.concat(tag).join(", "));
    }
  };

  const getPreviewStyle = (style: SubtitleStyle) => {
    switch (style) {
      case "plain-white":
        return {
          color: "#ffffff",
          background: "transparent",
          textShadow: "0 2px 8px rgba(0, 0, 0, 0.9)",
        };
      case "yellow-bg":
        return { color: "#ffffff", background: "#facc15" };
      case "pink-bg":
        return { color: "#ffffff", background: "#ec4899" };
      case "blue-bg":
        return { color: "#ffffff", background: "#3b82f6" };
      case "red-bg":
        return { color: "#ffffff", background: "#ef4444" };
      default:
        return { color: "#ffffff", background: "transparent" };
    }
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getVideoCreditCost = (durationSeconds: number) => {
    const units = Math.floor(durationSeconds / 30);
    return Math.max(units, 1) * 1000;
  };

  const effectiveDuration = trimmedDuration ?? 120;
  const creditCost = getVideoCreditCost(effectiveDuration);
  const userCreditsRemaining = user?.creditsRemaining || 0;
  const hasEnoughCredits = userCreditsRemaining >= creditCost;
  const canGenerateSongs = description.trim().length >= 5 && tags.trim().length > 0 && lyrics.trim().length >= 10;

  const getStepLabel = (step: string): string => {
    const stepMap: Record<string, string> = {
      project_creation: "Setting up project",
      song_generation: "Creating lyric song",
      audio_trimming: "Preparing audio",
      subtitle_generation: "Creating captions",
      scene_planning: "Planning scenes",
      scene_generation: "Creating scenes",
      video_generation: "Assembling video",
    };
    return stepMap[step] || step;
  };

  const sortedLogs = generationLogs?.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) || [];
  const completedStepsMap = new Map<string, GenerationLog>();
  sortedLogs.filter((log) => log.status === "completed").forEach((log) => {
    if (!completedStepsMap.has(log.step) || new Date(log.createdAt) > new Date(completedStepsMap.get(log.step)!.createdAt)) {
      completedStepsMap.set(log.step, log);
    }
  });
  const completedSteps = Array.from(completedStepsMap.values())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((log) => log.step);
  const currentStep = sortedLogs
    .filter((log) => log.status === "progress")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  
  // Only count video generation steps for progress calculation
  // (scene_planning, scene_generation, video_generation)
  const videoGenerationSteps = ["scene_planning", "scene_generation", "video_generation"];
  const completedVideoSteps = completedSteps.filter(step => videoGenerationSteps.includes(step));
  const totalVideoSteps = 3;
  const progressPercentage = project?.isCompleted 
    ? 100 
    : Math.min((completedVideoSteps.length / totalVideoSteps) * 100, 95);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationHeader currentPage="home" />

      <main className="flex-1 container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" className="mb-6" onClick={() => navigate("/create")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Create
          </Button>

          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Lyric</h1>
            <p className="text-muted-foreground">Create lyric videos with AI songs, timed captions, and scene generation.</p>
          </div>

          <VideoStyleCapabilityNotes variant="lyric" className="mb-6" />

          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-foreground">Create Lyric Video</CardTitle>
              <CardDescription>
                Generate 2 AI songs with MiniMax, choose one, trim it, and generate your lyric video.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="p-4 bg-muted/30 rounded-lg border border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <Label className="text-sm font-semibold flex-shrink-0">Song Source:</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        variant={songSource === "ai-generated" ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setSongSource("ai-generated");
                          setShowTrimInterfaceForUpload(false);
                        }}
                        className="flex-shrink-0"
                      >
                        <Music className="w-4 h-4 mr-2" />
                        AI Generated Song
                      </Button>
                      <Button
                        type="button"
                        variant={songSource === "upload" ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setSongSource("upload");
                          setShowTrimInterfaceForGenerated(false);
                          setSelectedGeneratedSongForTrim(null);
                        }}
                        className="flex-shrink-0"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Song
                      </Button>
                    </div>
                  </div>
                </div>

                {songSource === "upload" && showTrimInterfaceForUpload && previewAudioUrl && previewAudioDuration > 0 ? (
                  <>
                    <AudioTrimInterface
                      audioUrl={previewAudioUrl}
                      audioDuration={previewAudioDuration}
                      onTrim={handleTrimUploadedSong}
                      onCancel={handleCancelUploadTrim}
                      isTrimming={isTrimming}
                      isPaidUser={isPaidUser}
                      fixedDuration={!isPaidUser ? 30 : undefined}
                    />
                    {(isTrimming || isUploading || uploadProgress > 0) && (
                      <div className="bg-muted/30 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{uploadStatus || "Processing..."}</span>
                          <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                        </div>
                        <Progress value={uploadProgress} className="h-2" />
                      </div>
                    )}
                  </>
                ) : showTrimInterfaceForGenerated && selectedGeneratedSongForTrim ? (
                  <>
                    <div>
                      <Label className="flex items-center text-sm font-semibold mb-2">
                        <Music className="w-4 h-4 text-primary mr-2" />
                        Song Title (Optional)
                      </Label>
                      <Input
                        value={songTitle}
                        onChange={(e) => setSongTitle(e.target.value)}
                        placeholder="Enter a title for your song..."
                        disabled={isTrimming}
                      />
                    </div>
                    <AudioTrimInterface
                      audioUrl={selectedGeneratedSongForTrim.audioUrl}
                      audioDuration={selectedGeneratedSongForTrim.duration || 120}
                      onTrim={handleTrimGeneratedSong}
                      onCancel={() => {
                        setShowTrimInterfaceForGenerated(false);
                        setSelectedGeneratedSongForTrim(null);
                      }}
                      isTrimming={isTrimming}
                      isPaidUser={isPaidUser}
                      fixedDuration={!isPaidUser ? 30 : undefined}
                    />
                    {(isTrimming || uploadProgress > 0) && (
                      <div className="bg-muted/30 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{uploadStatus || "Processing..."}</span>
                          <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                        </div>
                        <Progress value={uploadProgress} className="h-2" />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {songSource === "upload" && !trimmedAudioUrl && (
                      <>
                        <div
                          className={`upload-zone rounded-lg p-12 text-center cursor-pointer transition-colors border-2 border-dashed ${
                            isDragOver ? "border-primary bg-primary/10" : "border-border"
                          } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
                          onClick={handleAudioUpload}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/mpeg,audio/wav,audio/aac,audio/mp3"
                            onChange={handleFileInputChange}
                            className="hidden"
                          />
                          <Music className="w-12 h-12 text-muted-foreground mb-4 mx-auto" />
                          <p className="text-muted-foreground mb-2">Drag and drop your audio file here</p>
                          <p className="text-sm text-muted-foreground">or click to browse</p>
                          <p className="text-xs text-muted-foreground mt-2">Supports MP3, WAV, AAC (Max 10MB)</p>
                        </div>
                        {(isUploading || isTrimming) && (
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">{uploadStatus || "Processing..."}</span>
                              <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                            </div>
                            <Progress value={uploadProgress} className="h-2" />
                          </div>
                        )}
                      </>
                    )}

                    <div>
                      <Label className="flex items-center text-sm font-semibold mb-2">
                        <Music className="w-4 h-4 text-primary mr-2" />
                        What is your song about?
                        <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Textarea
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          if (descriptionError && e.target.value.trim().length > 0) {
                            setDescriptionError(false);
                          }
                        }}
                        onBlur={() => {
                          if (description.trim().length === 0) {
                            setDescriptionError(true);
                          }
                        }}
                        placeholder="e.g., A lonely cowboy cat riding through the desert at sunset..."
                        rows={3}
                        className={`${
                          descriptionError && description.trim().length === 0
                            ? "textarea-pink-glow border-pink-500/50 focus:border-pink-500"
                            : description.trim().length > 0 && description.trim().length < 5
                            ? "border-red-500"
                            : ""
                        }`}
                        data-testid="song-description-input"
                      />
                      {descriptionError && description.trim().length === 0 && (
                        <p className="text-sm text-pink-400 mt-2 flex items-center gap-2">
                          <span className="text-pink-500">⚠</span>
                          This field is required. Please describe what your song is about.
                        </p>
                      )}
                      {description.trim().length > 0 && description.trim().length < 5 && (
                        <p className="text-sm text-red-500 mt-2">Description must be at least 5 characters long.</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-6 py-3 px-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Switch checked={includeWatermark} onCheckedChange={setIncludeWatermark} disabled={!isPremiumUser} data-testid="watermark-toggle" />
                        <Label className="text-sm font-medium cursor-pointer" onClick={() => isPremiumUser && setIncludeWatermark(!includeWatermark)}>
                          Watermark
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch checked={isPublic} onCheckedChange={setIsPublic} disabled={!isPremiumUser} data-testid="privacy-toggle" />
                        <Label className="text-sm font-medium cursor-pointer" onClick={() => isPremiumUser && setIsPublic(!isPublic)}>
                          Public
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch checked={isVertical} onCheckedChange={setIsVertical} data-testid="aspect-ratio-toggle" />
                        <Label className="text-sm font-medium cursor-pointer flex items-center gap-2" onClick={() => setIsVertical(!isVertical)}>
                          {isVertical ? (
                            <>
                              <Smartphone className="h-4 w-4" />
                              Portrait (3:4)
                            </>
                          ) : (
                            <>
                              <Monitor className="h-4 w-4" />
                              Landscape (16:9)
                            </>
                          )}
                        </Label>
                      </div>
                    </div>
                    {!isPremiumUser && (
                      <p className="text-sm text-pink-500 mt-2">
                        Watermark removal and private options are only available in paid plans.
                      </p>
                    )}

                    <div className="mt-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Switch id="add-subtitles" checked={isPremiumUser ? addSubtitles : false} onCheckedChange={setAddSubtitles} data-testid="subtitles-toggle" disabled={!isPremiumUser} />
                          <Label htmlFor="add-subtitles" className="text-sm font-medium cursor-pointer" onClick={() => isPremiumUser && setAddSubtitles(!addSubtitles)}>
                            Captions
                          </Label>
                          {addSubtitles && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setShowCaptionStyles(!showCaptionStyles)}
                              className={`h-8 px-2 text-xs ml-2 transition-all flex-shrink-0 ${addSubtitles && !showCaptionStyles ? "shadow-[0_0_10px_rgba(236,72,153,0.5),0_0_20px_rgba(236,72,153,0.3),0_0_30px_rgba(236,72,153,0.2)] border-pink-500/50" : ""}`}
                              data-testid="caption-styles-button"
                            >
                              Styles
                              <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showCaptionStyles ? "rotate-180" : ""}`} />
                            </Button>
                          )}
                        </div>
                        {!isPremiumUser && (
                          <p className="text-sm text-pink-500">
                            Captions are only available for paid users.
                          </p>
                        )}
                        {addSubtitles && showCaptionStyles && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex gap-2 flex-shrink-0">
                              <Button type="button" variant={textPosition === "top" ? "default" : "outline"} size="sm" onClick={() => setTextPosition("top")} className={`h-8 w-8 p-0 ${textPosition === "top" ? "bg-primary" : ""}`} title="Top">
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant={textPosition === "center" ? "default" : "outline"} size="sm" onClick={() => setTextPosition("center")} className={`h-8 w-8 p-0 ${textPosition === "center" ? "bg-primary" : ""}`} title="Center">
                                <AlignVerticalSpaceAround className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant={textPosition === "bottom" ? "default" : "outline"} size="sm" onClick={() => setTextPosition("bottom")} className={`h-8 w-8 p-0 ${textPosition === "bottom" ? "bg-primary" : ""}`} title="Bottom">
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                            </div>
                            <Select value={fontFamily} onValueChange={(value) => isGoogleFont(value) && setFontFamily(value)}>
                              <SelectTrigger className="bg-background border-border text-foreground h-8 w-full sm:w-[180px] text-xs">
                                <SelectValue placeholder="Select font" />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border max-h-[300px]">
                                {popularGoogleFonts.map((font) => (
                                  <SelectItem key={font.value} value={font.value} className="text-foreground" style={{ fontFamily: font.value }}>
                                    {font.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      {addSubtitles && showCaptionStyles && (
                        <div className="bg-muted/30 border border-border rounded-lg p-4">
                          <Label className="text-sm font-semibold mb-3 block">Caption Style</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                            {subtitleStyleOptions.map((option) => (
                              <button
                                type="button"
                                key={option.value}
                                onClick={() => setSubtitleStyle(option.value)}
                                className={`text-center p-2 rounded-md border transition-colors min-w-0 ${subtitleStyle === option.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                                data-testid={`caption-style-${option.value}`}
                              >
                                <div className={option.value === "plain-white" ? "bg-gray-800 rounded-md p-1 inline-block" : ""}>
                                  <div className="text-xs font-bold text-center py-1 px-2 rounded-md inline-block whitespace-nowrap overflow-hidden text-ellipsis max-w-full" style={{ ...getPreviewStyle(option.value), fontFamily }}>
                                    Hello
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {songSource === "ai-generated" && (
                      <div>
                        <Label className="flex items-center text-sm font-semibold mb-2">
                          <Tags className="w-4 h-4 text-primary mr-2" />
                          Musical Style & Tags
                        </Label>
                        <Input
                          value={tags}
                          onChange={(e) => setTags(e.target.value)}
                          placeholder="e.g., electronic, pop, female singer, upbeat, dreamy"
                          className={tags.trim().length === 0 && description.trim().length >= 5 ? "border-red-500" : ""}
                          data-testid="song-tags-input"
                        />
                        <p className="text-xs text-muted-foreground mt-1">{tags.trim().length === 0 && description.trim().length >= 5 ? <span className="text-red-500">Tags are required to generate songs</span> : "Separate tags with commas"}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {suggestedTags.map((tag) => (
                            <button key={tag} onClick={() => addTag(tag)} className="text-xs bg-primary/20 text-primary px-2 py-1 rounded cursor-pointer hover:bg-primary/30 transition-colors" data-testid={`tag-${tag}`}>
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {songSource === "ai-generated" && (
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                          <Label className="flex items-center text-sm font-semibold">
                            <Music className="w-4 h-4 text-accent mr-2" />
                            Lyrics
                          </Label>
                          <Button
                            onClick={() => {
                              if (description.trim().length === 0) {
                                setDescriptionError(true);
                                toast({
                                  title: "Description Required",
                                  description: "Please describe what your song is about before generating lyrics.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              generateLyricsMutation.mutate();
                            }}
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
                        <Textarea
                          value={lyrics}
                          onChange={(e) => setLyrics(e.target.value)}
                          placeholder="Write your lyrics here, or click Generate Lyrics."
                          rows={6}
                          className={lyrics.trim().length > 0 && lyrics.trim().length < 10 ? "border-red-500" : ""}
                          data-testid="lyrics-textarea"
                        />
                        {songTitle && (
                          <div className="mt-3 p-3 bg-primary/10 rounded-md">
                            <div className="flex items-center gap-2">
                              <Music className="w-4 h-4 text-primary" />
                              <span className="text-sm font-semibold text-muted-foreground">Generated Song Title:</span>
                              <span className="font-bold text-primary">{songTitle}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {songSource === "ai-generated" && generateSongMutation.isPending && (
                      <div className="bg-muted/30 rounded-lg p-4" data-testid="song-generation-progress">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-semibold">Generating Songs...</span>
                          <div className="loading-spinner"></div>
                        </div>
                        <Progress value={progress} className="mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {progress < 30 ? "Processing your request..." : progress < 60 ? "Generating musical composition..." : progress < 80 ? "Creating vocals..." : progress < 100 ? "Mixing and mastering..." : "Song generation complete!"}
                        </p>
                      </div>
                    )}

                    {songSource === "ai-generated" && (
                      <Button
                        onClick={() => {
                          if (description.trim().length === 0) {
                            setDescriptionError(true);
                            toast({
                              title: "Description Required",
                              description: "Please describe what your song is about before generating songs.",
                              variant: "destructive",
                            });
                            return;
                          }
                          generateSongMutation.mutate();
                        }}
                        disabled={!canGenerateSongs || generateSongMutation.isPending}
                        className="w-full floating-button"
                        data-testid="generate-song-button"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Songs (2)
                      </Button>
                    )}
                  </>
                )}

                {trimmedAudioUrl && (
                  <div className="space-y-4 border border-border rounded-lg p-4 bg-muted/20">
                    <AudioPlayer audioUrl={trimmedAudioUrl} title="Your Trimmed Song" />
                    {trimmedDuration && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Trimmed duration: {formatDuration(trimmedDuration)}
                      </p>
                    )}
                    {trimmedLyrics && addSubtitles && (
                      <p className="text-xs text-muted-foreground">
                        Timed captions are ready from trimmed lyrics and forced alignment.
                      </p>
                    )}
                    {!hasEnoughCredits && (
                      <>
                        <FreePlanVideoUpsellAlert user={user} className="mt-2" />
                        {!isFreePlanUser(user) && (
                          <Alert variant="destructive" className="mt-2">
                            <AlertTitle>Insufficient Credits</AlertTitle>
                            <AlertDescription>
                              Credits Required to Generate Video: {creditCost.toLocaleString()} (You have{" "}
                              {userCreditsRemaining.toLocaleString()} remaining)
                            </AlertDescription>
                          </Alert>
                        )}
                      </>
                    )}
                    <Button
                      onClick={() => {
                        if (description.trim().length === 0) {
                          setDescriptionError(true);
                          toast({
                            title: "Description Required",
                            description: "Please describe what your song is about before generating the video.",
                            variant: "destructive",
                          });
                          return;
                        }
                        generateVideoMutation.mutate();
                      }}
                      disabled={generateVideoMutation.isPending || !hasEnoughCredits || (project && !project.isCompleted)}
                      className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
                      data-testid="generate-lyric-video-button"
                    >
                      {generateVideoMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Video className="mr-2 h-4 w-4" />
                          Generate Lyric Video
                          <span className="ml-2 text-xs opacity-90">({creditCost.toLocaleString()} credits)</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {(generatedProjectId || generateVideoMutation.isPending) && (
            <Card ref={progressCardRef} className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center">
                  <Video className="mr-2 h-5 w-5" />
                  Video Generation Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                {generateVideoMutation.isPending && !generatedProjectId ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="text-foreground font-medium">0%</span>
                    </div>
                    <Progress value={5} className="h-2" />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Initializing video generation...</span>
                    </div>
                  </div>
                ) : project ? (
                  <div className="space-y-4">
                    {!project.isCompleted ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="text-foreground font-medium">{Math.round(progressPercentage)}%</span>
                        </div>
                        <Progress value={Math.max(progressPercentage, 5)} className="h-2" />
                        {currentStep ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{currentStep.message}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Starting video generation...</span>
                          </div>
                        )}
                        {completedSteps.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-border/50">
                            <p className="text-xs text-muted-foreground font-medium mb-1">Completed:</p>
                            {completedSteps.map((step) => {
                              const latestLog = completedStepsMap.get(step);
                              return (
                                <div key={step} className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                                  <span>{latestLog?.message || getStepLabel(step)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <p className="text-foreground">
                        <span className="font-semibold">Title:</span> {project.title}
                      </p>
                      <p className="text-foreground">
                        <span className="font-semibold">Status:</span>{" "}
                        {project.isCompleted ? <span className="text-green-400">✓ Completed</span> : <span className="text-yellow-400">⏳ Processing</span>}
                      </p>
                    </div>

                    {project.isCompleted && project.finalVideoUrl && (
                      <div className="space-y-2">
                        <p className="text-green-400 font-semibold">Your video is ready!</p>
                        <video controls className="w-full rounded-lg" src={project.finalVideoUrl} data-testid="video-player">
                          Your browser does not support the video tag.
                        </video>
                        <div className="flex gap-2">
                          <Button onClick={async () => {
                            if (!project.finalVideoUrl) return;
                            try {
                              await downloadFileFromUrl(project.finalVideoUrl, "music-video.mp4");
                              toast({ title: "Download started", description: "Your video is downloading." });
                            } catch {
                              toast({ title: "Download failed", description: "Could not download. Try opening the link and saving from your browser.", variant: "destructive" });
                            }
                          }} className="flex-1 bg-green-600 hover:bg-green-700" data-testid="button-download">
                            Download Video
                          </Button>
                          <Button onClick={() => navigate(`/create/story-mode?edit=${project.id}&t=${Date.now()}`)} variant="outline" className="flex-1" data-testid="button-edit">
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            onClick={() => {
                              setGeneratedProjectId(null);
                              setSongProjectId(null);
                              setTrimmedAudioUrl(null);
                              setTrimmedDuration(null);
                              setTrimmedSubtitleFileUrl(null);
                              setTrimmedLyrics(null);
                            }}
                            variant="outline"
                            className="flex-1"
                          >
                            Create New
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading project details...
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Dialog open={showSongSelection} onOpenChange={setShowSongSelection}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold gradient-text">Choose Your Favorite Song</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              We generated {generatedSongs.length} songs for you. Select one to trim.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-6">
            {generatedSongs.map((song, index) => (
              <Card
                key={index}
                className={`cursor-pointer transition-all ${selectedGeneratedSongIndex === index ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/50"}`}
                onClick={() => setSelectedGeneratedSongIndex(index)}
                data-testid={`generated-song-option-${index}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        {selectedGeneratedSongIndex === index && <Check className="h-5 w-5 text-primary" />}
                        <h3 className="font-semibold text-lg">{song.title}</h3>
                        <span className="text-sm bg-primary/20 text-primary px-2 py-1 rounded">Song {index + 1}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {Math.round(song.duration || 0)}s
                        </div>
                      </div>
                      <audio src={song.audioUrl} controls className="w-full" data-testid={`generated-song-audio-${index}`} onClick={(e) => e.stopPropagation()} />
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
            <Button variant="outline" onClick={() => setShowSongSelection(false)} className="flex-1" data-testid="cancel-song-selection">
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

      <Footer />
    </div>
  );
}
