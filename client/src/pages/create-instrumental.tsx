import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Music, Video, Monitor, Smartphone, Palette, ArrowLeft, Clock, Subtitles, ChevronDown, CheckCircle2, Edit, Tags, Type, ArrowUp, AlignVerticalSpaceAround, ArrowDown, Upload } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { downloadFileFromUrl } from "@/lib/utils";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useLocation } from "wouter";
import { Project, GenerationLog } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
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

// Updated tags for instrumental/cinematic music
const suggestedTags = ["Epic", "Cinematic", "Hans Zimmer", "electronic", "rock", "upbeat", "hip-hop", "country", "reggae", "synthwave", "kpop"];

export default function CreateInstrumental() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [songSource, setSongSource] = useState<"ai-generated" | "upload">("ai-generated");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("9:16");
  const [duration, setDuration] = useState<number[]>([30]); // Duration in seconds (15-180)
  const [textOverlay, setTextOverlay] = useState("");
  const [textPosition, setTextPosition] = useState<"top" | "center" | "bottom">("bottom");
  const [addSubtitles, setAddSubtitles] = useState<boolean>(false);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(defaultSubtitleStyle);
  const [fontFamily, setFontFamily] = useState<GoogleFont>(defaultGoogleFont);
  const [showCaptionStyles, setShowCaptionStyles] = useState(false);
  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);
  const progressCardRef = useRef<HTMLDivElement>(null);
  
  // Upload song state
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [showTrimInterface, setShowTrimInterface] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [previewAudioDuration, setPreviewAudioDuration] = useState<number>(0);
  const [isTrimming, setIsTrimming] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null);
  const [trimmedDuration, setTrimmedDuration] = useState<number | null>(null);
  const [trimmedSubtitleFileUrl, setTrimmedSubtitleFileUrl] = useState<string | null>(null);
  const [tempProjectId, setTempProjectId] = useState<string | null>(null); // Store temp project ID for re-applying captions
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Check if user is paid (has a plan with monthly price > 0)
  const isPaidUser = user?.plan && user.plan.monthlyPrice > 0;
  const isPremiumUser = user?.plan?.name === "Premium";

  // Fetch project details if we have a generated project
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", generatedProjectId],
    enabled: !!generatedProjectId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Clear generatedProjectId if project is completed (allows creating new videos)
  useEffect(() => {
    if (project?.isCompleted && generatedProjectId) {
      // Don't clear immediately - let user see the completed video
      // They can click "Create New" to clear it
    }
  }, [project?.isCompleted, generatedProjectId]);

  // Fetch generation logs for progress tracking
  const { data: generationLogs } = useQuery<GenerationLog[]>({
    queryKey: ["/api/projects", generatedProjectId, "logs"],
    enabled: !!generatedProjectId,
    refetchInterval: (query) => {
      // Poll every 1 second if we have logs, 2 seconds if we don't have any yet
      const logs = query.state.data || [];
      return logs.length > 0 ? 1000 : 2000;
    },
    queryFn: async () => {
      if (!generatedProjectId) return [];
      const response = await apiRequest("GET", `/api/projects/${generatedProjectId}/logs`);
      return response.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { 
      description: string; 
      tags: string; 
      aspectRatio: string; 
      duration: number; 
      textOverlay?: string;
      textPosition?: string;
      addSubtitles: boolean; 
      subtitleStyle: string;
      fontFamily: string;
    }) => {
      const response = await apiRequest("POST", "/api/instrumental", {
        description: data.description,
        tags: data.tags,
        aspectRatio: data.aspectRatio,
        duration: data.duration,
        textOverlay: data.textOverlay || undefined,
        textPosition: data.textPosition || "bottom",
        addSubtitles: data.addSubtitles,
        subtitleStyle: data.subtitleStyle,
        fontFamily: data.fontFamily
      });
      const result = await response.json();
      // Set project ID immediately so logs can start fetching
      if (result.projectId) {
        setGeneratedProjectId(result.projectId);
      }
      return result;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Video Generation Started!",
        description: data.message,
      });
      // Project ID is already set in mutationFn, but ensure it's set here too
      if (data.projectId && !generatedProjectId) {
        setGeneratedProjectId(data.projectId);
        // Scroll to progress bar when project ID is received
        setTimeout(() => {
          if (progressCardRef.current) {
            progressCardRef.current.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
          }
        }, 200);
      }
    },
    onError: (error: any) => {
      if (error.missing) {
        toast({
          title: "Incomplete Prompt",
          description: error.suggestion,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to generate video",
          variant: "destructive",
        });
      }
    },
  });

  const handleGenerate = () => {
    if (!description.trim()) {
      toast({
        title: "Empty Description",
        description: "Please enter a description for your song",
        variant: "destructive",
      });
      return;
    }

    if (!tags.trim()) {
      toast({
        title: "Empty Tags",
        description: "Please enter musical tags for your song",
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({ 
      description, 
      tags, 
      aspectRatio, 
      duration: duration[0], 
      textOverlay: textOverlay.trim() || undefined,
      textPosition,
      addSubtitles, 
      subtitleStyle,
      fontFamily
    });
    
    // Scroll to progress bar after a short delay to allow it to render
    setTimeout(() => {
      if (progressCardRef.current) {
        progressCardRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }, 100);
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Calculate credit cost based on duration
  // Pricing: 1000 credits for every 15 seconds of video (rounded up, minimum 1000)
  const getVideoCreditCost = (durationSeconds: number) => {
    const units = Math.ceil(durationSeconds / 15);
    return Math.max(units, 1) * 1000; // Minimum 1000 credits
  };

  // Use trimmed duration if available (for uploaded songs), otherwise use slider duration
  const effectiveDuration = trimmedDuration ?? duration[0];
  const creditCost = getVideoCreditCost(effectiveDuration);
  const userCreditsRemaining = user?.creditsRemaining || 0;
  const hasEnoughCredits = userCreditsRemaining >= creditCost;

  // Map step names to user-friendly labels
  const getStepLabel = (step: string): string => {
    const stepMap: Record<string, string> = {
      "project_creation": "Setting up project",
      "song_generation": "Creating instrumental song",
      "audio_trimming": "Preparing audio",
      "subtitle_generation": "Creating captions",
      "scene_planning": "Planning scenes",
      "scene_generation": "Creating scenes",
      "video_generation": "Assembling video",
    };
    return stepMap[step] || step;
  };

  // Get all logs sorted by creation time
  const sortedLogs = generationLogs?.sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  ) || [];

  // Get unique completed steps (only the latest completed log for each step)
  const completedStepsMap = new Map<string, GenerationLog>();
  sortedLogs
    .filter(log => log.status === "completed")
    .forEach(log => {
      // Keep the latest completed log for each step
      if (!completedStepsMap.has(log.step) || 
          new Date(log.createdAt) > new Date(completedStepsMap.get(log.step)!.createdAt)) {
        completedStepsMap.set(log.step, log);
      }
    });
  const completedSteps = Array.from(completedStepsMap.values())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(log => log.step);

  // Get current in-progress step (most recent progress log)
  const currentStep = sortedLogs
    .filter(log => log.status === "progress")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  // Calculate progress percentage based on completed steps
  const totalSteps = 7; // Total number of steps (no character generation)
  const progressPercentage = project?.isCompleted 
    ? 100 
    : Math.min((completedSteps.length / totalSteps) * 100, 95); // Cap at 95% until video is complete

  // Helper function to add tag
  const addTag = (tag: string) => {
    const currentTags = tags.trim();
    if (currentTags) {
      // Check if tag already exists
      const tagList = currentTags.split(',').map(t => t.trim());
      if (!tagList.includes(tag)) {
        setTags(`${currentTags}, ${tag}`);
      }
    } else {
      setTags(tag);
    }
  };

  // File upload handlers
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
      toast({
        title: "Error",
        description: "Failed to load audio file. Please try another file.",
        variant: "destructive",
      });
      URL.revokeObjectURL(previewUrl);
      setPendingFile(null);
    });
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

  const handleCancelTrim = () => {
    setShowTrimInterface(false);
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
    }
    setPreviewAudioUrl(null);
    setPendingFile(null);
  };

  // Trim audio mutation
  const trimAudioMutation = useMutation({
    mutationFn: async ({ projectId, audioUrl, startTime, endTime }: { 
      projectId: string;
      audioUrl: string; 
      startTime: number; 
      endTime: number;
    }) => {
      setUploadProgress(50);
      setUploadStatus("Trimming audio...");
      
      // Trim the uploaded audio
      const trimResponse = await apiRequest("POST", `/api/projects/${projectId}/trim-audio`, {
        audioUrl,
        startTime,
        endTime,
        addSubtitles: isPremiumUser && addSubtitles,
        subtitleStyle,
        lyrics: null,
        sourceSubtitleFileUrl: null,
      });
      
      return await trimResponse.json();
    },
    onSuccess: async (data) => {
      setUploadProgress(100);
      setUploadStatus("Complete!");
      
      // Store the trimmed audio URL, duration, and subtitle file URL (but don't create project yet)
      setUploadedAudioUrl(data.audioUrl);
      if (data.duration) {
        setTrimmedDuration(data.duration);
      }
      if (data.subtitleFileUrl) {
        setTrimmedSubtitleFileUrl(data.subtitleFileUrl);
      }
      
      // Clean up preview URL
      if (previewAudioUrl && previewAudioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewAudioUrl);
      }
      
      setPreviewAudioUrl(null);
      setPendingFile(null);
      setShowTrimInterface(false);
      setIsTrimming(false);
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatus("");
      
      toast({
        title: "Success",
        description: `Audio trimmed successfully! Duration: ${Math.floor((data.duration || 0) / 60)}:${String((data.duration || 0) % 60).padStart(2, '0')}. You can now configure your video settings and generate.`,
      });
    },
    onError: (error: any) => {
      setIsUploading(false);
      setIsTrimming(false);
      toast({
        title: "Trim Failed",
        description: error.message || "Failed to trim audio",
        variant: "destructive",
      });
    },
  });

  const handleTrim = async (startTime: number, endTime: number) => {
    if (!previewAudioUrl || !pendingFile) return;
    
    setIsTrimming(true);
    setIsUploading(true);
    setUploadStatus("Uploading audio file...");
    
    try {
      // Create a temporary project just for uploading and trimming
      // We'll create the final project when user clicks generate
      const projectResponse = await apiRequest("POST", "/api/projects", {
        title: "Instrumental Video (Temporary)",
        description: "Temporary project for audio upload",
        aspectRatio: aspectRatio,
        currentStep: 1,
        addSubtitles: false, // Don't generate subtitles yet
        subtitleStyle: subtitleStyle,
        fontFamily: fontFamily,
        isInstrumental: true
      });
      const projectData = await projectResponse.json();
      const tempProjectId = projectData.id;
      setTempProjectId(tempProjectId); // Store for re-applying captions
      
      // Upload the audio
      const formData = new FormData();
      formData.append('audio', pendingFile);
      formData.append('addSubtitles', 'false');
      formData.append('subtitleStyle', subtitleStyle);
      formData.append('aspectRatio', aspectRatio);
      
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete * 0.3);
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
              projectId: tempProjectId,
              audioUrl: uploadData.audioUrl,
              startTime,
              endTime,
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
      
      xhr.open('POST', `/api/projects/${tempProjectId}/upload-audio`);
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

  // Generate video from uploaded/trimmed audio mutation
  const generateUploadedMutation = useMutation({
    mutationFn: async () => {
      if (!uploadedAudioUrl || !trimmedDuration) {
        throw new Error("Please upload and trim a song first");
      }
      
      if (!description.trim()) {
        throw new Error("Please enter a description for your video");
      }
      
      // Re-apply captions with current settings before generating
      if (tempProjectId) {
        try {
          await reapplyCaptionsMutation.mutateAsync();
        } catch (error) {
          // Continue anyway even if reapply fails
          console.error("Failed to re-apply captions, continuing anyway:", error);
        }
      }
      
      // Create the project now with user's settings
      const projectResponse = await apiRequest("POST", "/api/projects", {
        title: description.substring(0, 50),
        description: description,
        aspectRatio: aspectRatio,
        currentStep: 1,
        addSubtitles: isPremiumUser && addSubtitles,
        subtitleStyle: subtitleStyle,
        fontFamily: fontFamily,
        isInstrumental: true
      });
      const projectData = await projectResponse.json();
      const projectId = projectData.id;
      
      // Call the instrumental endpoint with the uploaded audio
      const response = await apiRequest("POST", "/api/instrumental", {
        description: description,
        tags: "instrumental", // Not used for uploaded songs but required by endpoint
        aspectRatio: aspectRatio,
        duration: trimmedDuration,
        textOverlay: textOverlay || undefined,
        textPosition: textPosition || "bottom",
        addSubtitles: isPremiumUser && addSubtitles,
        subtitleStyle: subtitleStyle,
        fontFamily: fontFamily,
        audioUrl: uploadedAudioUrl, // Pass the uploaded audio URL
        projectId: projectId, // Pass the project ID
        subtitleFileUrl: trimmedSubtitleFileUrl || undefined, // Pass the subtitle file URL from trim
      });
      
      const result = await response.json();
      return { ...result, projectId };
    },
    onSuccess: (data: any) => {
      toast({
        title: "Video Generation Started!",
        description: data.message || "Your video is being created in the background.",
      });
      
      if (data.projectId) {
        setGeneratedProjectId(data.projectId);
        // Scroll to progress bar when project ID is received
        setTimeout(() => {
          if (progressCardRef.current) {
            progressCardRef.current.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
          }
        }, 200);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start video generation",
        variant: "destructive",
      });
    },
  });

  // Re-apply captions when user clicks Generate (only if audio was trimmed)
  const reapplyCaptionsMutation = useMutation({
    mutationFn: async () => {
      if (!tempProjectId) return;
      const response = await apiRequest("POST", `/api/projects/${tempProjectId}/reapply-captions`, {
        subtitleStyle,
        textPosition,
        fontFamily,
        addSubtitles: isPremiumUser && addSubtitles,
      });
      return response.json();
    },
    onSuccess: () => {
      // Silently update
    },
    onError: (error) => {
      console.error("Failed to re-apply captions:", error);
      // Don't block the flow - just log the error
    },
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationHeader currentPage="home" />
      
      <main className="flex-1 container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            className="mb-6"
            onClick={() => navigate("/create")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Create
          </Button>

          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Instrumental
            </h1>
            <p className="text-muted-foreground">
              Create cinematic instrumental music videos with optional text overlays
            </p>
          </div>

          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-foreground">Create Instrumental Video</CardTitle>
              <CardDescription>
                Choose to generate a song with AI or upload your own. You can also add optional text overlays to display in the video.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Song Source Toggle */}
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
                          setShowTrimInterface(false);
                          if (previewAudioUrl) {
                            URL.revokeObjectURL(previewAudioUrl);
                          }
                          setPreviewAudioUrl(null);
                          setPendingFile(null);
                          setUploadedAudioUrl(null);
                          setTrimmedDuration(null);
                          setTrimmedSubtitleFileUrl(null);
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
                          setDescription("");
                          setTags("");
                        }}
                        className="flex-shrink-0"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Song
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Upload Song Interface - only show when upload is selected and not yet trimmed */}
                {songSource === "upload" && !uploadedAudioUrl && (
                  <>
                    {showTrimInterface && previewAudioUrl && previewAudioDuration > 0 ? (
                      <AudioTrimInterface
                        audioUrl={previewAudioUrl}
                        audioDuration={previewAudioDuration}
                        onTrim={handleTrim}
                        onCancel={handleCancelTrim}
                        isTrimming={isTrimming}
                        isPaidUser={isPaidUser}
                        fixedDuration={!isPaidUser ? 30 : undefined}
                      />
                    ) : (
                      <div 
                        className={`upload-zone rounded-lg p-12 text-center cursor-pointer transition-colors border-2 border-dashed ${
                          isDragOver ? 'border-primary bg-primary/10' : 'border-border'
                        } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
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
                    
                    {/* Upload Progress */}
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

                {/* Audio Preview Player - show after trimming is complete */}
                {songSource === "upload" && uploadedAudioUrl && (
                  <div className="mt-4">
                    <AudioPlayer audioUrl={uploadedAudioUrl} title="Your Trimmed Audio" />
                  </div>
                )}

                {/* Description field - show for both AI generated and upload */}
                {(songSource === "ai-generated" || songSource === "upload") && (
                  <div>
                    <Label className="flex items-center text-sm font-semibold mb-2">
                      <Music className="w-4 h-4 text-primary mr-2" />
                      Describe your video
                    </Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={songSource === "ai-generated" ? "a cinematic track, epic, Hans Zimmer style track..." : "Describe your video..."}
                      className="min-h-[100px] bg-background border-border text-foreground placeholder:text-muted-foreground"
                      data-testid="input-description"
                    />
                  </div>
                )}

                {/* Musical Style & Tags - only for AI generated */}
                {songSource === "ai-generated" && (
                  <div>
                    <Label className="flex items-center text-sm font-semibold mb-2">
                      <Tags className="w-4 h-4 text-primary mr-2" />
                      Musical Style & Tags
                    </Label>
                    <Input
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="e.g., Epic, Cinematic, Hans Zimmer, electronic, upbeat"
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
                )}

                {/* Aspect Ratio and Duration - show for both, but duration only for AI generated */}
                {(songSource === "ai-generated" || songSource === "upload") && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-foreground flex items-center gap-2">
                        {aspectRatio === "16:9" ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                        Aspect Ratio
                      </Label>
                      <Select value={aspectRatio} onValueChange={(value: "16:9" | "9:16") => setAspectRatio(value)}>
                        <SelectTrigger className="bg-background border-border text-foreground">
                          <SelectValue placeholder="Select aspect ratio" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="16:9" className="text-foreground">
                            <span className="flex items-center gap-2">
                              <Monitor className="h-4 w-4" />
                              Landscape (16:9)
                            </span>
                          </SelectItem>
                          <SelectItem value="9:16" className="text-foreground">
                            <span className="flex items-center gap-2">
                              <Smartphone className="h-4 w-4" />
                              Portrait (9:16)
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {songSource === "ai-generated" && (
                      <div className="space-y-2">
                        <Label className="text-foreground flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Video Duration: {formatDuration(duration[0])}
                        </Label>
                        <Slider
                          value={duration}
                          onValueChange={setDuration}
                          min={15}
                          max={180}
                          step={15}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>15s</span>
                          <span>3m</span>
                        </div>
                      </div>
                    )}

                    {songSource === "upload" && uploadedAudioUrl && trimmedDuration && (
                      <div className="space-y-2">
                        <Label className="text-foreground flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Audio Duration: {formatDuration(trimmedDuration)}
                        </Label>
                        <div className="text-sm text-muted-foreground">
                          Your trimmed audio is {formatDuration(trimmedDuration)} long
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Captions section - show for both AI generated and upload */}
                {(songSource === "ai-generated" || songSource === "upload") && (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Switch
                          id="add-subtitles"
                          checked={addSubtitles}
                          onCheckedChange={setAddSubtitles}
                          data-testid="subtitles-toggle"
                          disabled={!isPremiumUser}
                        />
                        <Label htmlFor="add-subtitles" className="text-sm font-medium cursor-pointer" onClick={() => isPremiumUser && setAddSubtitles(!addSubtitles)}>
                          Captions
                        </Label>
                      {addSubtitles && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCaptionStyles(!showCaptionStyles)}
                          className={`h-8 px-2 text-xs ml-2 transition-all flex-shrink-0 ${
                            addSubtitles && !showCaptionStyles
                              ? 'shadow-[0_0_10px_rgba(236,72,153,0.5),0_0_20px_rgba(236,72,153,0.3),0_0_30px_rgba(236,72,153,0.2)] border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.7),0_0_25px_rgba(236,72,153,0.5),0_0_35px_rgba(236,72,153,0.3)]' 
                              : ''
                          }`}
                          data-testid="caption-styles-button"
                        >
                          Styles
                          <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showCaptionStyles ? 'rotate-180' : ''}`} />
                        </Button>
                      )}
                    </div>
                    {addSubtitles && showCaptionStyles && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            type="button"
                            variant={textPosition === "top" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setTextPosition("top")}
                            className={`h-8 w-8 p-0 ${textPosition === "top" ? "bg-primary" : ""}`}
                            title="Top"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant={textPosition === "center" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setTextPosition("center")}
                            className={`h-8 w-8 p-0 ${textPosition === "center" ? "bg-primary" : ""}`}
                            title="Center"
                          >
                            <AlignVerticalSpaceAround className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant={textPosition === "bottom" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setTextPosition("bottom")}
                            className={`h-8 w-8 p-0 ${textPosition === "bottom" ? "bg-primary" : ""}`}
                            title="Bottom"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <Select value={fontFamily} onValueChange={(value) => isGoogleFont(value) && setFontFamily(value)}>
                          <SelectTrigger className="bg-background border-border text-foreground h-8 w-full sm:w-[180px] text-xs">
                            <SelectValue placeholder="Select font" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border max-h-[300px]">
                            {popularGoogleFonts.map((font) => (
                              <SelectItem 
                                key={font.value} 
                                value={font.value} 
                                className="text-foreground"
                                style={{ fontFamily: font.value }}
                              >
                                {font.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  {!isPremiumUser && (
                    <p className="text-sm text-pink-500">
                      Captions are only available for paid users.
                    </p>
                  )}
                  
                  {addSubtitles && showCaptionStyles && (
                    <div className="bg-muted/30 border border-border rounded-lg p-4">
                      <Label className="text-sm font-semibold mb-3 block">Caption Style</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                        {subtitleStyleOptions.map((option) => {
                          const getPreviewStyle = () => {
                            switch (option.value) {
                              case "plain-white":
                                return {
                                  color: "#ffffff",
                                  background: "transparent",
                                  textShadow: "0 2px 8px rgba(0, 0, 0, 0.9)",
                                };
                              case "yellow-bg":
                                return {
                                  color: "#ffffff",
                                  background: "#facc15",
                                };
                              case "pink-bg":
                                return {
                                  color: "#ffffff",
                                  background: "#ec4899",
                                };
                              case "blue-bg":
                                return {
                                  color: "#ffffff",
                                  background: "#3b82f6",
                                };
                              case "red-bg":
                                return {
                                  color: "#ffffff",
                                  background: "#ef4444",
                                };
                              default:
                                return {
                                  color: "#ffffff",
                                  background: "transparent",
                                };
                            }
                          };

                          return (
                            <button
                              type="button"
                              key={option.value}
                              onClick={() => setSubtitleStyle(option.value)}
                              className={`text-center p-2 rounded-md border transition-colors min-w-0 ${
                                subtitleStyle === option.value
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-primary/50"
                              }`}
                              data-testid={`caption-style-${option.value}`}
                            >
                              <div className={option.value === "plain-white" ? "bg-gray-800 rounded-md p-1 inline-block" : ""}>
                                <div 
                                  className="text-xs font-bold text-center py-1 px-2 rounded-md inline-block whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
                                  style={{
                                    ...getPreviewStyle(),
                                    fontFamily: fontFamily,
                                  }}
                                >
                                  Hello
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {addSubtitles && (
                    <div>
                      <Label className="flex items-center text-sm font-semibold mb-2">
                        <Type className="w-4 h-4 text-accent mr-2" />
                        Text Overlay (Optional)
                      </Label>
                      <Textarea
                        value={textOverlay}
                        onChange={(e) => setTextOverlay(e.target.value)}
                        placeholder="Enter text to display in the video. One line per 5 seconds.&#10;Example:&#10;Believe in yourself&#10;Never give up&#10;Dream big"
                        rows={4}
                        className={`bg-background border-border text-foreground placeholder:text-muted-foreground ${
                          (() => {
                            const lines = textOverlay.split("\n").filter(l => l.trim().length > 0);
                            const videoDuration = songSource === "ai-generated" ? duration[0] : (trimmedDuration || 0);
                            const maxLines = Math.floor(videoDuration / 5);
                            return lines.length > maxLines && videoDuration > 0 ? 'border-yellow-500' : '';
                          })()
                        }`}
                        data-testid="text-overlay-input"
                      />
                      {(() => {
                        const lines = textOverlay.split("\n").filter(l => l.trim().length > 0);
                        const videoDuration = songSource === "ai-generated" ? duration[0] : (trimmedDuration || 0);
                        const maxLines = Math.floor(videoDuration / 5);
                        const hasTooManyLines = lines.length > maxLines && videoDuration > 0;
                        
                        return (
                          <div className="mt-1">
                            {hasTooManyLines ? (
                              <p className="text-xs text-yellow-500 font-medium">
                                ⚠️ Warning: You have {lines.length} line{lines.length !== 1 ? 's' : ''}, but your video is only {formatDuration(videoDuration)} long. 
                                Maximum {maxLines} line{maxLines !== 1 ? 's' : ''} allowed ({formatDuration(videoDuration)} ÷ 5 seconds per line). 
                                Extra lines will not be displayed.
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Each line will be displayed for 5 seconds. You can enter sentences or single words per line.
                                {videoDuration > 0 && (
                                  <span className="ml-1">Maximum {maxLines} line{maxLines !== 1 ? 's' : ''} for {formatDuration(videoDuration)} video.</span>
                                )}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
                )}
              </div>

              {songSource === "ai-generated" && (
                <>
                  {!hasEnoughCredits && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertTitle>Insufficient Credits</AlertTitle>
                      <AlertDescription>
                        You need {creditCost.toLocaleString()} credits to generate this video, but you only have {userCreditsRemaining.toLocaleString()} credits.
                      </AlertDescription>
                    </Alert>
                  )}
                  <Button
                    onClick={handleGenerate}
                    disabled={generateMutation.isPending || !hasEnoughCredits || (project && !project.isCompleted)}
                    className="w-full mt-6 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                    data-testid="button-generate"
                    title={!hasEnoughCredits ? `Not enough credits. Required: ${creditCost.toLocaleString()}, You have: ${userCreditsRemaining.toLocaleString()}` : (project && !project.isCompleted) ? "Video generation in progress..." : undefined}
                  >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Music className="mr-2 h-4 w-4" />
                      Generate Instrumental Video
                      <span className="ml-2 text-xs opacity-90">
                        ({creditCost.toLocaleString()} credits)
                      </span>
                    </>
                  )}
                </Button>
                </>
              )}

              {songSource === "upload" && uploadedAudioUrl && trimmedDuration && (
                <>
                  {!hasEnoughCredits && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertTitle>Insufficient Credits</AlertTitle>
                      <AlertDescription>
                        You need {creditCost.toLocaleString()} credits to generate this video, but you only have {userCreditsRemaining.toLocaleString()} credits.
                      </AlertDescription>
                    </Alert>
                  )}
                  <Button
                    onClick={() => generateUploadedMutation.mutate()}
                    disabled={generateUploadedMutation.isPending || !hasEnoughCredits || (project && !project.isCompleted)}
                    className="w-full mt-6 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                    data-testid="button-generate-uploaded"
                    title={!hasEnoughCredits ? `Not enough credits. Required: ${creditCost.toLocaleString()}, You have: ${userCreditsRemaining.toLocaleString()}` : (project && !project.isCompleted) ? "Video generation in progress..." : undefined}
                  >
                  {generateUploadedMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Video className="mr-2 h-4 w-4" />
                      Generate Instrumental Video
                      <span className="ml-2 text-xs opacity-90">
                        ({creditCost.toLocaleString()} credits)
                      </span>
                    </>
                  )}
                </Button>
                </>
              )}
            </CardContent>
          </Card>

          {(generatedProjectId || generateMutation.isPending || generateUploadedMutation.isPending) && (
            <Card ref={progressCardRef} className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center">
                  <Video className="mr-2 h-5 w-5" />
                  Video Generation Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                {generateMutation.isPending && !generatedProjectId ? (
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
                    {/* Progress Bar - Always show when project exists and not completed */}
                    {!project.isCompleted ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="text-foreground font-medium">{Math.round(progressPercentage)}%</span>
                        </div>
                        <Progress value={Math.max(progressPercentage, 5)} className="h-2" />
                        
                        {/* Current Step */}
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

                        {/* Completed Steps */}
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

                        {/* Scene Image Thumbnails - Only show when video is not completed */}
                        {!project.isCompleted && project.sceneImages && project.sceneImages.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-border/50">
                            <p className="text-xs text-muted-foreground font-medium mb-2">Scene Previews:</p>
                            <div className="flex flex-wrap gap-2">
                              {project.sceneImages.map((imageUrl, index) => {
                                // Convert relative paths to full URLs if needed
                                const fullImageUrl = imageUrl.startsWith('http') 
                                  ? imageUrl 
                                  : imageUrl.startsWith('/') 
                                    ? `${window.location.origin}${imageUrl}`
                                    : imageUrl;
                                
                                return (
                                  <div
                                    key={index}
                                    className="relative w-20 h-20 rounded-md overflow-hidden border border-border/50 hover:border-primary/50 transition-colors"
                                  >
                                    <img
                                      src={fullImageUrl}
                                      alt={`Scene ${index + 1}`}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                      onError={(e) => {
                                        // Fallback if image fails to load
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                    <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1 rounded">
                                      {index + 1}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
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
                        {project.isCompleted ? (
                          <span className="text-green-400">✓ Completed</span>
                        ) : (
                          <span className="text-yellow-400">⏳ Processing</span>
                        )}
                      </p>
                    </div>

                    {project.isCompleted && project.finalVideoUrl && (
                      <div className="space-y-2">
                        <p className="text-green-400 font-semibold">Your video is ready!</p>
                        <video
                          controls
                          className="w-full rounded-lg"
                          src={project.finalVideoUrl}
                          data-testid="video-player"
                        >
                          Your browser does not support the video tag.
                        </video>
                        <div className="flex gap-2">
                          <Button
                            onClick={async () => {
                              if (!project.finalVideoUrl) return;
                              try {
                                await downloadFileFromUrl(project.finalVideoUrl, "music-video.mp4");
                                toast({ title: "Download started", description: "Your video is downloading." });
                              } catch {
                                toast({ title: "Download failed", description: "Could not download. Try opening the link and saving from your browser.", variant: "destructive" });
                              }
                            }}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            data-testid="button-download"
                          >
                            Download Video
                          </Button>
                          <Button
                            onClick={() => navigate(`/create/story-mode?edit=${project.id}&t=${Date.now()}`)}
                            variant="outline"
                            className="flex-1"
                            data-testid="button-edit"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            onClick={() => {
                              setGeneratedProjectId(null);
                              generateMutation.reset();
                              generateUploadedMutation.reset();
                            }}
                            variant="outline"
                            className="flex-1"
                          >
                            Create New
                          </Button>
                        </div>
                      </div>
                    )}

                    {!project.isCompleted && (
                      <div className="flex items-center text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating your instrumental video... This may take a few minutes.
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

      <Footer />
    </div>
  );
}
