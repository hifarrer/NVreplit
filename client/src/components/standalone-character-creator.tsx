import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SaveCharacterModal } from "@/components/modals/save-character-modal";
import { CharacterCameraAngleModal } from "@/components/modals/character-camera-angle-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Upload, Sparkles, Loader2, Check, AlertTriangle, Crown, Maximize2, X, Download, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CharacterAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

interface StandaloneCharacterCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onCharacterGenerated: (result: { imageUrl: string; prompt: string }) => void;
  /** When true, render as full page content instead of a modal (no Dialog wrapper) */
  asPage?: boolean;
  /** When true, show aspect ratio dropdown and pass it to generate APIs (same behavior as full page). */
  showAspectRatioPicker?: boolean;
  /** When opening the modal, sync internal aspect ratio (e.g. match parent video form). */
  initialAspectRatio?: CharacterAspectRatio;
  /** Shot type prefix for character prompts (default: "front shot"). Use "full body shot" for motion control. */
  shotType?: string;
  /** Hint text shown below the prompt field. */
  promptHint?: string;
}

interface CharacterStyle {
  style_name: string;
  model: string;
  thumbnail_image: string;
  prompt_enhancer: string | null;
}

interface CharacterLimitInfo {
  count: number;
  limit: number | null;
  isFreePlan: boolean;
  isAtLimit: boolean;
  canCreate: boolean;
}

export function StandaloneCharacterCreator({
  isOpen,
  onClose,
  onCharacterGenerated,
  asPage = false,
  showAspectRatioPicker = false,
  initialAspectRatio,
  shotType = "front shot",
  promptHint,
}: StandaloneCharacterCreatorProps) {
  const showAspectControls = asPage || showAspectRatioPicker;
  /** Modal (e.g. All Purpose): no camera angle; primary action is picking the image for the parent flow. */
  const isModalMode = !asPage;
  const primaryPickLabel = isModalMode ? "Use This image" : "Save to Library";
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("generate");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generatedImageRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Character generation state
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<CharacterStyle | null>(null);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentCharacterUrl, setCurrentCharacterUrl] = useState<string | null>(null);
  const [currentCharacterPrompt, setCurrentCharacterPrompt] = useState("");
  const [cameraAngleImageUrl, setCameraAngleImageUrl] = useState<string | null>(null);

  // Upload tab state
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedImagePrompt, setUploadedImagePrompt] = useState("");
  const [selectedUploadStyle, setSelectedUploadStyle] = useState<CharacterStyle | null>(null);
  const [generatedUploadImageUrl, setGeneratedUploadImageUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [aspectRatio, setAspectRatio] = useState<CharacterAspectRatio>("1:1");

  useEffect(() => {
    if (isOpen && initialAspectRatio) {
      setAspectRatio(initialAspectRatio);
    }
  }, [isOpen, initialAspectRatio]);

  // Fetch character styles
  const { data: styles = [] } = useQuery<CharacterStyle[]>({
    queryKey: ['/api/characters/styles'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/characters/styles');
      return response.json();
    },
  });

  // Set default style to "No style" when styles load
  useEffect(() => {
    if (styles.length > 0) {
      if (!selectedStyle) {
        setSelectedStyle(styles[0]);
      }
      if (!selectedUploadStyle) {
        // For upload tab, use first style that is NOT "No style"
        const firstNonNoStyle = styles.find(style => style.style_name !== "No style") || styles[0];
        setSelectedUploadStyle(firstNonNoStyle);
      }
    }
  }, [styles, selectedStyle, selectedUploadStyle]);

  // Fetch character limit info
  const { data: limitInfo, refetch: refetchLimitInfo } = useQuery<CharacterLimitInfo>({
    queryKey: ['/api/characters/limit'],
  });

  // Generate character mutation
  const generateCharacterMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStyle) {
        throw new Error("Please select a style");
      }

      setProgress(0);
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 5000);

      const response = await apiRequest("POST", `/api/characters/generate-options`, {
        prompt: prompt,
        aspectRatio: showAspectControls ? aspectRatio : "16:9",
        style: selectedStyle.style_name,
        model: selectedStyle.model,
        promptEnhancer: selectedStyle.prompt_enhancer,
        shotType,
      }, { timeout: 900000 });

      clearInterval(progressInterval);
      setProgress(100);

      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedImageUrls(data.imageUrls);
      setCurrentCharacterPrompt(prompt);
      toast({
        title: "Success",
        description: "Character generated successfully!",
      });
      setTimeout(() => {
        if (window.innerWidth < 768) {
          generatedImageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    },
    onError: (error) => {
      setProgress(0);
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to generate character",
        variant: "destructive",
      });
    }
  });

  // Image-to-image generation mutation for upload tab
  const generateImageToImageMutation = useMutation({
    mutationFn: async () => {
      if (!uploadedImageUrl || !selectedUploadStyle) {
        throw new Error("Please upload an image and select a style");
      }

      setUploadProgress(0);
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 5000);

      const response = await apiRequest("POST", `/api/characters/generate-image-to-image`, {
        imageUrl: uploadedImageUrl,
        prompt: uploadedImagePrompt || "character",
        promptEnhancer: selectedUploadStyle.prompt_enhancer,
        aspectRatio: showAspectControls ? aspectRatio : "1:1",
        shotType,
      }, { timeout: 900000 });

      clearInterval(progressInterval);
      setUploadProgress(100);

      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedUploadImageUrl(data.imageUrl);
      setCurrentCharacterUrl(data.imageUrl);
      setCurrentCharacterPrompt(data.prompt);
      toast({
        title: "Success",
        description: "Character style changed successfully!",
      });
    },
    onError: (error) => {
      setUploadProgress(0);
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to change character style",
        variant: "destructive",
      });
    }
  });

  // Save character to library mutation
  const saveCharacterMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const response = await apiRequest("POST", `/api/characters`, {
        imageUrl,
        prompt: currentCharacterPrompt,
        name: prompt || "AI Generated Character",
        style: selectedStyle?.style_name || "No style"
      });
      return response.json();
    },
    onSuccess: (data, imageUrl) => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      queryClient.invalidateQueries({ queryKey: ['/api/characters/limit'] });
      setCurrentCharacterUrl(imageUrl);
      onCharacterGenerated({ imageUrl, prompt: currentCharacterPrompt });
      toast({
        title: "Success",
        description: "Character saved to your library!",
      });
      refetchLimitInfo();
    },
    onError: (error: any) => {
      if (error?.isLimitError) {
        toast({
          title: "Character Limit Reached",
          description: "Free users can save up to 30 characters. Upgrade to a paid plan for unlimited characters.",
          variant: "destructive",
        });
        refetchLimitInfo();
      } else {
        toast({
          title: "Error",
          description: error?.message || "Failed to save character",
          variant: "destructive",
        });
      }
    }
  });

  // Save to library only mutation
  const saveToLibraryMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const response = await apiRequest("POST", "/api/characters", {
        imageUrl,
        prompt: currentCharacterPrompt,
        name: `Character ${Date.now()}`,
        style: selectedStyle?.style_name || "No style"
      });
      return response.json();
    },
    onSuccess: (data, imageUrl) => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      queryClient.invalidateQueries({ queryKey: ['/api/characters/limit'] });
      toast({
        title: "Success",
        description: "Character saved to your library!",
      });
      refetchLimitInfo();
    },
    onError: (error: any) => {
      if (error?.isLimitError) {
        toast({
          title: "Character Limit Reached",
          description: "Free users can save up to 30 characters. Upgrade to a paid plan for unlimited characters.",
          variant: "destructive",
        });
        refetchLimitInfo();
      } else {
        toast({
          title: "Error",
          description: error?.message || "Failed to save character to library",
          variant: "destructive",
        });
      }
    }
  });

  const handleCharacterUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await uploadCharacterImage(file);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;

    await uploadCharacterImage(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const uploadCharacterImage = async (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload JPEG, PNG, or GIF images.",
        variant: "destructive",
      });
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please upload images under 5MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await apiRequest('POST', `/api/characters/upload`, formData);

      const data = await response.json();
      
      if (response.ok) {
        setUploadedImageUrl(data.imageUrl);
        setUploadedImagePrompt('Uploaded character image');
        setGeneratedUploadImageUrl(null);
        setCurrentCharacterUrl(data.imageUrl);
        setCurrentCharacterPrompt('Uploaded character image');
        toast({
          title: "Success",
          description: "Character image uploaded successfully!",
        });
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload character image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSelectGeneratedImage = (imageUrl: string) => {
    setCurrentCharacterUrl(imageUrl);
    saveCharacterMutation.mutate(imageUrl);
  };

  const handleCameraAngleSuccess = (_oldUrl: string, newUrl: string) => {
    setGeneratedImageUrls((prev) => [...prev, newUrl]);
    setCameraAngleImageUrl(null);
    toast({
      title: "Success",
      description: "Camera angle applied. New image added.",
    });
  };

  const handleDownloadImage = async (imageUrl: string, defaultName = "character") => {
    try {
      const response = await fetch(imageUrl, { mode: "cors" });
      if (!response.ok) throw new Error("Failed to fetch image");
      const blob = await response.blob();
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${defaultName}-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Download started", description: "Your image is being saved." });
    } catch {
      toast({
        title: "Download failed",
        description: "Could not download the image. Try opening it in a new tab and saving manually.",
        variant: "destructive",
      });
    }
  };

  const canGenerate = prompt.trim().length > 10 && selectedStyle !== null;
  const isSaveDisabled = limitInfo?.isAtLimit && limitInfo?.isFreePlan;

  const mainContent = (
    <div className="space-y-6">
          {limitInfo?.isAtLimit && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span>
                    You've reached the limit of {limitInfo.limit} saved characters. 
                    You can still generate characters, but to save them, please delete some existing characters or subscribe to a plan.
                  </span>
                  <Link href="/plans?trial=1" onClick={onClose}>
                    <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 whitespace-nowrap">
                      <Crown className="h-3 w-3 mr-1" />
                      Start $1 Trial
                    </Button>
                  </Link>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-transparent border-b border-border rounded-none h-auto p-0 mb-6">
              <TabsTrigger 
                value="generate" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 text-base font-medium transition-colors"
              >
                Generate
              </TabsTrigger>
              <TabsTrigger 
                value="upload" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 text-base font-medium transition-colors"
              >
                Upload
              </TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="mt-0">
              {/* Desktop Layout: Styles on left, Generated images on right */}
              <div className="hidden md:flex gap-6">
                {/* Left: Styles */}
                <div className="w-80 flex-shrink-0">
                  <Label className="text-sm font-semibold mb-3 block">Select Style</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    {styles.map((style) => (
                      <button
                        key={style.style_name}
                        onClick={() => setSelectedStyle(style)}
                        className={cn(
                          "p-2 border rounded-lg text-left transition-colors",
                          selectedStyle?.style_name === style.style_name
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary"
                        )}
                      >
                        <img
                          src={style.thumbnail_image}
                          alt={style.style_name}
                          className="w-full aspect-square object-cover rounded mb-2"
                          onError={(e) => {
                            console.error(`Failed to load image for ${style.style_name}:`, style.thumbnail_image);
                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=No+Image';
                          }}
                        />
                        <div className="text-xs font-semibold">{style.style_name}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right: Prompt and Generated Images */}
                <div className="flex-1 space-y-4">
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Describe Your Character</Label>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g., A woman with red jacket..."
                      rows={3}
                      className="resize-none"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{promptHint || "Be detailed about appearance, style, clothing, and mood"}</p>
                  </div>

                  {showAspectControls && (
                    <div className="flex flex-wrap items-center gap-4">
                      <Label className="text-sm font-semibold">Aspect ratio</Label>
                      <Select value={aspectRatio} onValueChange={(v: CharacterAspectRatio) => setAspectRatio(v)}>
                        <SelectTrigger className="w-[180px] bg-background border-border">
                          <SelectValue placeholder="Aspect ratio" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1:1">1:1 (Square)</SelectItem>
                          <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                          <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                          <SelectItem value="4:3">4:3 (Landscape)</SelectItem>
                          <SelectItem value="3:4">3:4 (Portrait)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button
                    onClick={() => generateCharacterMutation.mutate()}
                    disabled={!canGenerate || generateCharacterMutation.isPending}
                    className="w-full floating-button"
                  >
                    {generateCharacterMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Character
                      </>
                    )}
                  </Button>

                  {generateCharacterMutation.isPending && (
                    <div className="bg-muted/30 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-semibold text-sm">Generating Character...</span>
                        <div className="loading-spinner"></div>
                      </div>
                      <Progress value={progress} className="mb-2" />
                      <p className="text-sm text-muted-foreground">Creating your character...</p>
                    </div>
                  )}

                  {generatedImageUrls.length > 0 && (
                    <div ref={generatedImageRef} className="space-y-4">
                      <Label className="text-sm font-semibold block">Generated Characters</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {generatedImageUrls.map((imageUrl, index) => (
                          <div key={imageUrl} className="relative group border-2 rounded-lg overflow-hidden max-h-[280px] w-full" data-testid={`generated-character-${index}`}>
                            <img
                              src={imageUrl}
                              alt={`Generated character ${index + 1}`}
                              className={cn(
                                "w-full h-full max-h-[260px] rounded-lg object-contain transition-all",
                                currentCharacterUrl === imageUrl ? "ring-2 ring-primary" : ""
                              )}
                            />
                            {currentCharacterUrl === imageUrl && (
                              <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                                <Check className="w-4 h-4" />
                              </div>
                            )}
                            <div className="absolute top-2 left-2 flex gap-1 z-10">
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                onClick={() => setExpandedImageUrl(imageUrl)}
                                aria-label="View full size"
                              >
                                <Maximize2 className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                onClick={() => handleDownloadImage(imageUrl)}
                                aria-label="Download image"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors"></div>
                            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex flex-wrap gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity w-full px-2">
                              <Button
                                onClick={() => handleSelectGeneratedImage(imageUrl)}
                                className="bg-green-600 hover:bg-green-700 text-white"
                                size="sm"
                                data-testid={`save-character-${index}`}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                {primaryPickLabel}
                              </Button>
                              {asPage && (
                                <Button
                                  onClick={() => setCameraAngleImageUrl(imageUrl)}
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700 text-white"
                                  data-testid={`camera-angle-${index}`}
                                >
                                  <Camera className="w-4 h-4 mr-1" />
                                  Camera angle
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile Layout */}
              <div className="md:hidden space-y-4">
                <div>
                  <Label className="text-sm font-semibold mb-3 block">Select Style</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                    {styles.map((style) => (
                      <button
                        key={style.style_name}
                        onClick={() => setSelectedStyle(style)}
                        className={cn(
                          "p-2 border rounded-lg text-left transition-colors",
                          selectedStyle?.style_name === style.style_name
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary"
                        )}
                      >
                        <img
                          src={style.thumbnail_image}
                          alt={style.style_name}
                          className="w-full aspect-square object-cover rounded mb-2"
                          onError={(e) => {
                            console.error(`Failed to load image for ${style.style_name}:`, style.thumbnail_image);
                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=No+Image';
                          }}
                        />
                        <div className="text-xs font-semibold">{style.style_name}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold mb-2 block">Describe Your Character</Label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., A woman with red jacket..."
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{promptHint || "Be detailed about appearance, style, clothing, and mood"}</p>
                </div>

                {showAspectControls && (
                  <div className="flex flex-wrap items-center gap-4">
                    <Label className="text-sm font-semibold">Aspect ratio</Label>
                    <Select value={aspectRatio} onValueChange={(v: CharacterAspectRatio) => setAspectRatio(v)}>
                      <SelectTrigger className="w-[180px] bg-background border-border">
                        <SelectValue placeholder="Aspect ratio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">1:1 (Square)</SelectItem>
                        <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                        <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                        <SelectItem value="4:3">4:3 (Landscape)</SelectItem>
                        <SelectItem value="3:4">3:4 (Portrait)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button
                  onClick={() => generateCharacterMutation.mutate()}
                  disabled={!canGenerate || generateCharacterMutation.isPending}
                  className="w-full floating-button"
                >
                  {generateCharacterMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Character
                    </>
                  )}
                </Button>

                {generateCharacterMutation.isPending && (
                  <div className="bg-muted/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-sm">Generating Character...</span>
                      <div className="loading-spinner"></div>
                    </div>
                    <Progress value={progress} className="mb-2" />
                    <p className="text-sm text-muted-foreground">Creating your character...</p>
                  </div>
                )}

                {generatedImageUrls.length > 0 && (
                  <div ref={generatedImageRef} className="space-y-4">
                    <Label className="text-sm font-semibold block">Generated Characters</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {generatedImageUrls.map((imageUrl, index) => (
                        <div key={imageUrl} className="relative group border-2 rounded-lg overflow-hidden max-h-[280px] w-full" data-testid={`generated-character-${index}`}>
                          <img
                            src={imageUrl}
                            alt={`Generated character ${index + 1}`}
                            className={cn(
                              "w-full h-full max-h-[260px] rounded-lg object-contain transition-all",
                              currentCharacterUrl === imageUrl ? "ring-2 ring-primary" : ""
                            )}
                          />
                          {currentCharacterUrl === imageUrl && (
                            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                              <Check className="w-4 h-4" />
                            </div>
                          )}
                          <div className="absolute top-2 left-2 flex gap-1 z-10">
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-90"
                              onClick={() => setExpandedImageUrl(imageUrl)}
                              aria-label="View full size"
                            >
                              <Maximize2 className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-90"
                              onClick={() => handleDownloadImage(imageUrl)}
                              aria-label="Download image"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors"></div>
                          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex flex-wrap gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity w-full px-2">
                            <Button
                              onClick={() => handleSelectGeneratedImage(imageUrl)}
                              className="bg-green-600 hover:bg-green-700 text-white"
                              size="sm"
                              data-testid={`save-character-${index}`}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              {primaryPickLabel}
                            </Button>
                            {asPage && (
                              <Button
                                onClick={() => setCameraAngleImageUrl(imageUrl)}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                data-testid={`camera-angle-${index}`}
                              >
                                <Camera className="w-4 h-4 mr-1" />
                                Camera angle
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="upload" className="mt-0">
              {/* Same upload tab content as in character-creation-step.tsx */}
              <div className="space-y-6">
                <div className="hidden md:flex gap-6">
                  <div className="w-80 flex-shrink-0">
                    <Label className="text-sm font-semibold mb-3 block">Select Style</Label>
                    <div className="grid grid-cols-2 gap-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                      {styles.filter(style => style.style_name !== "No style").map((style) => (
                        <button
                          key={style.style_name}
                          onClick={() => setSelectedUploadStyle(style)}
                          className={cn(
                            "p-2 border rounded-lg text-left transition-colors",
                            selectedUploadStyle?.style_name === style.style_name
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary"
                          )}
                        >
                          <img
                            src={style.thumbnail_image}
                            alt={style.style_name}
                            className="w-full aspect-square object-cover rounded mb-2"
                            onError={(e) => {
                              console.error(`Failed to load image for ${style.style_name}:`, style.thumbnail_image);
                              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=No+Image';
                            }}
                          />
                          <div className="text-xs font-semibold">{style.style_name}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 space-y-4">
                    {!uploadedImageUrl ? (
                      <>
                        <div 
                          className="upload-zone rounded-lg p-8 text-center cursor-pointer border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors" 
                          onClick={handleCharacterUpload}
                          onDrop={handleDrop}
                          onDragOver={handleDragOver}
                        >
                          <User className="w-16 h-16 text-muted-foreground mb-4 mx-auto" />
                          <h4 className="text-lg font-semibold mb-2">Upload Character Image</h4>
                          <p className="text-muted-foreground mb-2 text-sm">Drag and drop your character image</p>
                          <p className="text-sm text-muted-foreground">or click to browse</p>
                          <p className="text-xs text-muted-foreground mt-3">PNG, JPG, GIF (Max 5MB)</p>
                        </div>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/gif"
                          onChange={handleFileChange}
                          className="hidden"
                        />

                        <Button 
                          onClick={handleCharacterUpload}
                          disabled={isUploading}
                          className="w-full floating-button"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 mr-2" />
                              Upload Image
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        {showAspectControls && (
                          <div className="flex flex-wrap items-center gap-4">
                            <Label className="text-sm font-semibold">Aspect ratio</Label>
                            <Select value={aspectRatio} onValueChange={(v: CharacterAspectRatio) => setAspectRatio(v)}>
                              <SelectTrigger className="w-[180px] bg-background border-border">
                                <SelectValue placeholder="Aspect ratio" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1:1">1:1 (Square)</SelectItem>
                                <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                                <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                                <SelectItem value="4:3">4:3 (Landscape)</SelectItem>
                                <SelectItem value="3:4">3:4 (Portrait)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-sm font-semibold mb-2 block">Original Image</Label>
                            <div className="relative group max-h-[260px] rounded-lg overflow-hidden border-2 border-border">
                              <img
                                src={uploadedImageUrl}
                                alt="Original character"
                                className="w-full h-full max-h-[240px] rounded-lg object-contain"
                              />
                              <div className="absolute top-2 left-2 flex gap-1 z-10">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => setExpandedImageUrl(uploadedImageUrl!)}
                                  aria-label="View full size"
                                >
                                  <Maximize2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleDownloadImage(uploadedImageUrl!, "character-original")}
                                  aria-label="Download image"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors"></div>
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  onClick={handleCharacterUpload}
                                  disabled={isUploading}
                                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                  size="sm"
                                >
                                  {isUploading ? (
                                    <>
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      Uploading...
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="w-4 h-4 mr-2" />
                                      Change Image
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-semibold mb-2 block">Generated Image</Label>
                            {generatedUploadImageUrl ? (
                              <div className="relative group max-h-[260px] rounded-lg overflow-hidden border-2 border-primary">
                                <img
                                  src={generatedUploadImageUrl}
                                  alt="Generated character"
                                  className="w-full h-full max-h-[240px] rounded-lg object-contain"
                                />
                                <div className="absolute top-2 left-2 flex gap-1 z-10">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => setExpandedImageUrl(generatedUploadImageUrl)}
                                    aria-label="View full size"
                                  >
                                    <Maximize2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => handleDownloadImage(generatedUploadImageUrl, "character-generated")}
                                    aria-label="Download image"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="w-full aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/20 max-h-[260px]">
                                <p className="text-sm text-muted-foreground text-center">Click "Change style" to generate</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              setCurrentCharacterUrl(uploadedImageUrl!);
                              setCurrentCharacterPrompt(uploadedImagePrompt);
                              saveCharacterMutation.mutate(uploadedImageUrl!);
                            }}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <Check className="w-4 h-4 mr-2" />
                            {primaryPickLabel}
                          </Button>
                          <Button
                            onClick={() => generateImageToImageMutation.mutate()}
                            disabled={!selectedUploadStyle || generateImageToImageMutation.isPending}
                            className="flex-1 floating-button"
                          >
                            {generateImageToImageMutation.isPending ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Changing Style...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Change Style
                              </>
                            )}
                          </Button>
                        </div>

                        {generateImageToImageMutation.isPending && (
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-semibold text-sm">Changing Style...</span>
                              <div className="loading-spinner"></div>
                            </div>
                            <Progress value={uploadProgress} className="mb-2" />
                            <p className="text-sm text-muted-foreground">Applying style to your character...</p>
                          </div>
                        )}

                        {generatedUploadImageUrl && (
                          <Button
                            onClick={() => {
                              setCurrentCharacterUrl(generatedUploadImageUrl);
                              setCurrentCharacterPrompt(uploadedImagePrompt);
                              saveCharacterMutation.mutate(generatedUploadImageUrl);
                            }}
                            className="w-full bg-green-600 hover:bg-green-700 text-white"
                          >
                            <Check className="w-4 h-4 mr-2" />
                            {primaryPickLabel}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Mobile layout for upload - same structure */}
                <div className="md:hidden space-y-4">
                  {/* Similar mobile layout as desktop but stacked */}
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Select Style</Label>
                      <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {styles.filter(style => style.style_name !== "No style").map((style) => (
                          <button
                            key={style.style_name}
                            onClick={() => setSelectedUploadStyle(style)}
                            className={cn(
                              "p-2 border rounded-lg text-left transition-colors",
                              selectedUploadStyle?.style_name === style.style_name
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary"
                            )}
                          >
                            <img
                              src={style.thumbnail_image}
                              alt={style.style_name}
                              className="w-full aspect-square object-cover rounded mb-2"
                              onError={(e) => {
                                console.error(`Failed to load image for ${style.style_name}:`, style.thumbnail_image);
                                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=No+Image';
                              }}
                            />
                            <div className="text-xs font-semibold">{style.style_name}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                  {!uploadedImageUrl ? (
                    <>
                      <div 
                        className="upload-zone rounded-lg p-8 text-center cursor-pointer border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors" 
                        onClick={handleCharacterUpload}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                      >
                        <User className="w-16 h-16 text-muted-foreground mb-4 mx-auto" />
                        <h4 className="text-lg font-semibold mb-2">Upload Character Image</h4>
                        <p className="text-muted-foreground mb-2 text-sm">Drag and drop your character image</p>
                        <p className="text-sm text-muted-foreground">or click to browse</p>
                        <p className="text-xs text-muted-foreground mt-3">PNG, JPG, GIF (Max 5MB)</p>
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif"
                        onChange={handleFileChange}
                        className="hidden"
                      />

                      <Button 
                        onClick={handleCharacterUpload}
                        disabled={isUploading}
                        className="w-full floating-button"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Upload Image
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      {showAspectControls && (
                        <div className="flex flex-wrap items-center gap-4">
                          <Label className="text-sm font-semibold">Aspect ratio</Label>
                          <Select value={aspectRatio} onValueChange={(v: CharacterAspectRatio) => setAspectRatio(v)}>
                            <SelectTrigger className="w-[180px] bg-background border-border">
                              <SelectValue placeholder="Aspect ratio" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1:1">1:1 (Square)</SelectItem>
                              <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                              <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                              <SelectItem value="4:3">4:3 (Landscape)</SelectItem>
                              <SelectItem value="3:4">3:4 (Portrait)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-4">
                        <div>
                          <Label className="text-sm font-semibold mb-2 block">Original Image</Label>
                          <div className="relative group max-h-[260px] rounded-lg overflow-hidden border-2 border-border mx-auto max-w-sm">
                            <img
                              src={uploadedImageUrl}
                              alt="Original character"
                              className="w-full h-full max-h-[240px] rounded-lg object-contain"
                            />
                            <div className="absolute top-2 left-2 flex gap-1 z-10">
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => setExpandedImageUrl(uploadedImageUrl!)}
                                aria-label="View full size"
                              >
                                <Maximize2 className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleDownloadImage(uploadedImageUrl!, "character-original")}
                                aria-label="Download image"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors"></div>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                onClick={handleCharacterUpload}
                                disabled={isUploading}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                size="sm"
                              >
                                {isUploading ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Uploading...
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Change Image
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-semibold mb-2 block">Generated Image</Label>
                          {generatedUploadImageUrl ? (
                            <div className="relative group max-h-[260px] rounded-lg overflow-hidden border-2 border-primary mx-auto max-w-sm">
                              <img
                                src={generatedUploadImageUrl}
                                alt="Generated character"
                                className="w-full h-full max-h-[240px] rounded-lg object-contain"
                              />
                              <div className="absolute top-2 left-2 flex gap-1 z-10">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => setExpandedImageUrl(generatedUploadImageUrl)}
                                  aria-label="View full size"
                                >
                                  <Maximize2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleDownloadImage(generatedUploadImageUrl, "character-generated")}
                                  aria-label="Download image"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="w-full aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/20 max-h-[260px] mx-auto max-w-sm">
                              <p className="text-sm text-muted-foreground text-center">Click "Change style" to generate</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          onClick={() => {
                            setCurrentCharacterUrl(uploadedImageUrl!);
                            setCurrentCharacterPrompt(uploadedImagePrompt);
                            saveCharacterMutation.mutate(uploadedImageUrl!);
                          }}
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          {primaryPickLabel}
                        </Button>
                        <Button
                          onClick={() => generateImageToImageMutation.mutate()}
                          disabled={!selectedUploadStyle || generateImageToImageMutation.isPending}
                          className="w-full floating-button"
                        >
                          {generateImageToImageMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Changing Style...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Change Style
                            </>
                          )}
                        </Button>
                      </div>

                      {generateImageToImageMutation.isPending && (
                        <div className="bg-muted/30 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-semibold text-sm">Changing Style...</span>
                            <div className="loading-spinner"></div>
                          </div>
                          <Progress value={uploadProgress} className="mb-2" />
                          <p className="text-sm text-muted-foreground">Applying style to your character...</p>
                        </div>
                      )}

                      {generatedUploadImageUrl && (
                        <Button
                          onClick={() => {
                            setCurrentCharacterUrl(generatedUploadImageUrl);
                            setCurrentCharacterPrompt(uploadedImagePrompt);
                            saveCharacterMutation.mutate(generatedUploadImageUrl);
                          }}
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          {primaryPickLabel}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
    </div>
  );

  const expandedImageDialog = (
    <Dialog open={!!expandedImageUrl} onOpenChange={(open) => !open && setExpandedImageUrl(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-2 overflow-hidden flex flex-col">
        <div className="flex justify-end gap-2">
          {expandedImageUrl && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleDownloadImage(expandedImageUrl)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setExpandedImageUrl(null)} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center p-4">
          {expandedImageUrl && (
            <img
              src={expandedImageUrl}
              alt="Character full size"
              className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  if (asPage) {
    return (
      <>
        <div className="max-w-6xl w-full mx-auto">
          <h1 className="gradient-text text-2xl font-bold mb-6">Create Character</h1>
          {mainContent}
        </div>
        {currentCharacterUrl && currentCharacterPrompt && (
          <SaveCharacterModal
            isOpen={showSaveModal}
            onClose={() => setShowSaveModal(false)}
            imageUrl={currentCharacterUrl}
            prompt={currentCharacterPrompt}
          />
        )}
        {cameraAngleImageUrl && (
          <CharacterCameraAngleModal
            isOpen={!!cameraAngleImageUrl}
            onClose={() => setCameraAngleImageUrl(null)}
            imageUrl={cameraAngleImageUrl}
            onSuccess={(newUrl) => handleCameraAngleSuccess(cameraAngleImageUrl, newUrl)}
          />
        )}
        {expandedImageDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="gradient-text">Create Character</DialogTitle>
          </DialogHeader>
          {mainContent}
        </DialogContent>

        {currentCharacterUrl && currentCharacterPrompt && (
          <SaveCharacterModal
            isOpen={showSaveModal}
            onClose={() => setShowSaveModal(false)}
            imageUrl={currentCharacterUrl}
            prompt={currentCharacterPrompt}
          />
        )}
      </Dialog>
      {expandedImageDialog}
    </>
  );
}
