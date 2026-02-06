import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CharacterLibraryModal } from "@/components/modals/character-library-modal";
import { SaveCharacterModal } from "@/components/modals/save-character-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Images, User, Upload, Sparkles, UserCheck, Bookmark, ArrowLeft, Music, Loader2, Check, AlertTriangle, Crown } from "lucide-react";
import { StepCircles } from "@/components/ui/step-circles";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

interface CharacterCreationStepProps {
  projectId: string;
  characterImageUrl?: string;
  makeCharacterSing?: boolean;
  onNext: () => void;
  onBack: () => void;
  onReset: () => void;
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

export function CharacterCreationStep({ projectId, characterImageUrl, makeCharacterSing: initialMakeCharacterSing, onNext, onBack, onReset }: CharacterCreationStepProps) {
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [currentCharacterUrl, setCurrentCharacterUrl] = useState(characterImageUrl);
  const [currentCharacterPrompt, setCurrentCharacterPrompt] = useState('');
  const [makeCharacterSing, setMakeCharacterSing] = useState(initialMakeCharacterSing ?? true);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("generate");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const characterPreviewRef = useRef<HTMLDivElement>(null);
  const generatedImageRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Character generation state
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<CharacterStyle | null>(null);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  // Upload tab state
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedImagePrompt, setUploadedImagePrompt] = useState("");
  const [selectedUploadStyle, setSelectedUploadStyle] = useState<CharacterStyle | null>(null);
  const [generatedUploadImageUrl, setGeneratedUploadImageUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

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
        console.log("Setting default style to:", styles[0]);
        setSelectedStyle(styles[0]); // First style is "No style"
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

      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-character-options`, {
        prompt: prompt,
        aspectRatio: "16:9",
        style: selectedStyle.style_name,
        model: selectedStyle.model,
        promptEnhancer: selectedStyle.prompt_enhancer
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
      // Auto-scroll to generated image on mobile
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
        description: "Failed to generate character",
        variant: "destructive",
      });
    }
  });

  // Save character to project mutation
  const saveCharacterMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const [projectResponse, libraryResponse] = await Promise.all([
        apiRequest("POST", `/api/projects/${projectId}/save-character-option`, {
          imageUrl,
          prompt: currentCharacterPrompt
        }),
        apiRequest("POST", `/api/characters`, {
          imageUrl,
          prompt: currentCharacterPrompt,
          name: prompt || "AI Generated Character",
          style: selectedStyle?.style_name || "No style"
        })
      ]);
      return {
        project: await projectResponse.json(),
        library: await libraryResponse.json()
      };
    },
    onSuccess: (data, imageUrl) => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      queryClient.invalidateQueries({ queryKey: ['/api/characters/limit'] });
      setCurrentCharacterUrl(imageUrl);
      toast({
        title: "Success",
        description: "Character saved to project and your library!",
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

      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-character-image-to-image`, {
        imageUrl: uploadedImageUrl,
        prompt: uploadedImagePrompt || "character",
        promptEnhancer: selectedUploadStyle.prompt_enhancer
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
        description: "Failed to change character style",
        variant: "destructive",
      });
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

      const response = await apiRequest('POST', `/api/projects/${projectId}/upload-character`, formData);

      const data = await response.json();
      
      if (response.ok) {
        setCurrentCharacterUrl(data.imageUrl);
        setCurrentCharacterPrompt('Uploaded character image');
        setUploadedImageUrl(data.imageUrl);
        setUploadedImagePrompt('Uploaded character image');
        setGeneratedUploadImageUrl(null); // Clear generated image when new image is uploaded
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

  const handleSavedCharacterSelected = async (character: { imageUrl: string; prompt: string }) => {
    try {
      const response = await apiRequest('POST', `/api/projects/${projectId}/save-character`, {
        imageUrl: character.imageUrl,
        prompt: character.prompt
      });

      if (response.ok) {
        setCurrentCharacterUrl(character.imageUrl);
        setCurrentCharacterPrompt(character.prompt);
        toast({
          title: "Character loaded",
          description: "Your saved character has been loaded successfully!",
        });
        setTimeout(() => {
          characterPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      } else {
        throw new Error('Failed to save character to project');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load the selected character. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSelectGeneratedImage = (imageUrl: string) => {
    setCurrentCharacterUrl(imageUrl);
    // Also save to project
    saveCharacterMutation.mutate(imageUrl);
  };

  const canGenerate = prompt.trim().length > 10 && selectedStyle !== null;
  const isSaveDisabled = limitInfo?.isAtLimit && limitInfo?.isFreePlan;

  return (
    <div className="max-w-4xl mx-auto mb-12 bg-card rounded-lg p-2 sm:p-4" data-testid="character-creation-step">
      <div className="bg-background border border-border rounded-lg p-4 sm:p-6 md:p-8">
        <div className="flex justify-end mb-4">
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
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold gradient-text mb-2">Create Your Character</h3>
          <p className="text-muted-foreground text-sm">Upload an image, generate an AI character, or choose from your saved characters</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-transparent border-b border-border rounded-none h-auto p-0 mb-6">
            <TabsTrigger 
              value="generate" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 text-base font-medium transition-colors"
              data-testid="tab-generate"
            >
              Generate
            </TabsTrigger>
            <TabsTrigger 
              value="library" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 text-base font-medium transition-colors"
              data-testid="tab-library"
            >
              Library
            </TabsTrigger>
            <TabsTrigger 
              value="upload" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 text-base font-medium transition-colors"
              data-testid="tab-upload"
            >
              Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="mt-0">
            <div className="space-y-6">
              {limitInfo?.isAtLimit && (
                <Alert className="border-amber-500/50 bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <span>
                        You've reached the limit of {limitInfo.limit} saved characters on the Free plan. 
                        You can still generate characters, but to save them, please delete some existing characters or upgrade your plan.
                      </span>
                      <Link href="/plans">
                        <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 whitespace-nowrap">
                          <Crown className="h-3 w-3 mr-1" />
                          Upgrade
                        </Button>
                      </Link>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

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
                    <p className="text-xs text-muted-foreground mt-1">Be detailed about appearance, style, clothing, and mood</p>
                  </div>

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
                      <div className="grid grid-cols-1 gap-4">
                        {generatedImageUrls.map((imageUrl, index) => (
                          <div key={index} className="relative group border-2 rounded-lg overflow-hidden" data-testid={`generated-character-${index}`}>
                            <img
                              src={imageUrl}
                              alt={`Generated character ${index + 1}`}
                              className={cn(
                                "w-full rounded-lg object-cover transition-all",
                                currentCharacterUrl === imageUrl ? "ring-2 ring-primary" : ""
                              )}
                            />
                            {currentCharacterUrl === imageUrl && (
                              <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                                <Check className="w-4 h-4" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors"></div>
                            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                onClick={() => handleSelectGeneratedImage(imageUrl)}
                                className="bg-green-600 hover:bg-green-700 text-white"
                                size="sm"
                                data-testid={`use-character-${index}`}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Use for Project
                              </Button>
                              <Button
                                onClick={() => saveToLibraryMutation.mutate(imageUrl)}
                                disabled={saveToLibraryMutation.isPending || isSaveDisabled}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                size="sm"
                                title={isSaveDisabled ? "Character limit reached - upgrade to save more" : ""}
                                data-testid={`save-to-library-${index}`}
                              >
                                <Bookmark className="w-4 h-4 mr-1" />
                                Save to Library
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile Layout: Styles on top, Generated images below */}
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
                  <p className="text-xs text-muted-foreground mt-1">Be detailed about appearance, style, clothing, and mood</p>
                </div>

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
                    <div className="space-y-4">
                      {generatedImageUrls.map((imageUrl, index) => (
                        <div key={index} className="relative group border-2 rounded-lg overflow-hidden" data-testid={`generated-character-${index}`}>
                          <img
                            src={imageUrl}
                            alt={`Generated character ${index + 1}`}
                            className={cn(
                              "w-full rounded-lg object-cover transition-all",
                              currentCharacterUrl === imageUrl ? "ring-2 ring-primary" : ""
                            )}
                          />
                          {currentCharacterUrl === imageUrl && (
                            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                              <Check className="w-4 h-4" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors"></div>
                          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity w-full px-2">
                            <Button
                              onClick={() => handleSelectGeneratedImage(imageUrl)}
                              className="bg-green-600 hover:bg-green-700 text-white w-full"
                              size="sm"
                              data-testid={`use-character-${index}`}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Use for Project
                            </Button>
                            <Button
                              onClick={() => saveToLibraryMutation.mutate(imageUrl)}
                              disabled={saveToLibraryMutation.isPending || isSaveDisabled}
                              className="bg-blue-600 hover:bg-blue-700 text-white w-full"
                              size="sm"
                              title={isSaveDisabled ? "Character limit reached - upgrade to save more" : ""}
                              data-testid={`save-to-library-${index}`}
                            >
                              <Bookmark className="w-4 h-4 mr-1" />
                              Save to Library
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="library" className="mt-0">
            <div className="text-center py-8">
              <img 
                src="https://res.cloudinary.com/dqemas8ht/image/upload/v1767383314/characters_bsaw13.png" 
                alt="Character Library" 
                className="w-48 sm:w-96 h-auto mx-auto mb-4 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setShowLibraryModal(true)}
                data-testid="image-character-library"
              />
              <h4 className="text-lg font-semibold mb-2">Character Library</h4>
              <p className="text-muted-foreground mb-6 text-sm">Choose from public or your saved characters</p>
              <Button 
                onClick={() => setShowLibraryModal(true)}
                className="floating-button px-8"
                data-testid="button-character-library"
              >
                <Images className="w-4 h-4 mr-2" />
                Open Library
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="mt-0">
            <div className="space-y-6">
              {/* Desktop Layout: Styles on left, Upload and Images on right */}
              <div className="hidden md:flex gap-6">
                {/* Left: Styles (excluding "No style") */}
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

                {/* Right: Upload and Images */}
                <div className="flex-1 space-y-4">
                  {!uploadedImageUrl ? (
                    <>
                      <div 
                        className="upload-zone rounded-lg p-8 text-center cursor-pointer border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors" 
                        onClick={handleCharacterUpload}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        data-testid="character-upload-zone"
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
                        data-testid="character-file-input"
                      />

                      <Button 
                        onClick={handleCharacterUpload}
                        disabled={isUploading}
                        className="w-full floating-button"
                        data-testid="upload-character-button"
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
                      <div className="grid grid-cols-2 gap-4">
                        {/* Original Image */}
                        <div>
                          <Label className="text-sm font-semibold mb-2 block">Original Image</Label>
                          <div className="relative group">
                            <img
                              src={uploadedImageUrl}
                              alt="Original character"
                              className="w-full rounded-lg object-cover border-2 border-border"
                            />
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
                        {/* Generated Image */}
                        <div>
                          <Label className="text-sm font-semibold mb-2 block">Generated Image</Label>
                          {generatedUploadImageUrl ? (
                            <img
                              src={generatedUploadImageUrl}
                              alt="Generated character"
                              className="w-full rounded-lg object-cover border-2 border-primary"
                            />
                          ) : (
                            <div className="w-full aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/20">
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
                          Use for Project
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
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              setCurrentCharacterUrl(generatedUploadImageUrl);
                              setCurrentCharacterPrompt(uploadedImagePrompt);
                            }}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <Check className="w-4 h-4 mr-2" />
                            Use for Project
                          </Button>
                          <Button
                            onClick={() => saveToLibraryMutation.mutate(generatedUploadImageUrl)}
                            disabled={saveToLibraryMutation.isPending || isSaveDisabled}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                            title={isSaveDisabled ? "Character limit reached - upgrade to save more" : ""}
                          >
                            <Bookmark className="w-4 h-4 mr-2" />
                            Save to Library
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Mobile Layout */}
              <div className="md:hidden space-y-4">
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
                      data-testid="character-upload-zone"
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
                      data-testid="character-file-input"
                    />

                    <Button 
                      onClick={handleCharacterUpload}
                      disabled={isUploading}
                      className="w-full floating-button"
                      data-testid="upload-character-button"
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
                      <div className="space-y-4">
                        <div>
                          <Label className="text-sm font-semibold mb-2 block">Original Image</Label>
                          <div className="relative group">
                            <img
                              src={uploadedImageUrl}
                              alt="Original character"
                              className="w-full rounded-lg object-cover border-2 border-border"
                            />
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
                          <img
                            src={generatedUploadImageUrl}
                            alt="Generated character"
                            className="w-full rounded-lg object-cover border-2 border-primary"
                          />
                        ) : (
                          <div className="w-full aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/20">
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
                        Use for Project
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
                      <div className="flex flex-col gap-2">
                        <Button
                          onClick={() => {
                            setCurrentCharacterUrl(generatedUploadImageUrl);
                            setCurrentCharacterPrompt(uploadedImagePrompt);
                          }}
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Use for Project
                        </Button>
                        <Button
                          onClick={() => saveToLibraryMutation.mutate(generatedUploadImageUrl)}
                          disabled={saveToLibraryMutation.isPending || isSaveDisabled}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          title={isSaveDisabled ? "Character limit reached - upgrade to save more" : ""}
                        >
                          <Bookmark className="w-4 h-4 mr-2" />
                          Save to Library
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {currentCharacterUrl && (
          <div ref={characterPreviewRef} className="mt-6 p-4 sm:p-6 media-player rounded-lg" data-testid="character-preview-section">
            <h4 className="text-lg font-semibold mb-4 flex items-center">
              <UserCheck className="w-4 h-4 text-primary mr-2" />
              Your Character
            </h4>
            <div className="flex flex-col items-center text-center">
              <img 
                src={currentCharacterUrl}
                alt="Generated character" 
                className="w-32 h-32 sm:w-40 sm:h-40 rounded-lg object-cover border-2 border-primary mb-4" 
                data-testid="character-preview-image"
              />
              <p className="font-semibold" data-testid="character-description">AI Generated Character</p>
              <p className="text-sm text-muted-foreground mb-3">Generated with AI</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {currentCharacterPrompt && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSaveModal(true)}
                    className="hover:bg-muted/50"
                    data-testid="button-save-character"
                  >
                    <Bookmark className="w-4 h-4 mr-2" />
                    Save Character
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Music className="w-5 h-5 text-primary" />
              <Label htmlFor="make-character-sing" className="text-base font-medium cursor-pointer">
                Make my character sing
              </Label>
            </div>
            <Switch
              id="make-character-sing"
              checked={makeCharacterSing}
              onCheckedChange={setMakeCharacterSing}
              data-testid="make-character-sing-toggle"
            />
          </div>
          <p className="text-sm text-muted-foreground mt-2 ml-8">
            When enabled, your character will lip-sync to the music. When disabled, regular video generation will be used.
          </p>
        </div>

        <div className="mt-8">
          <Button 
            variant="ghost"
            onClick={onBack}
            className="w-full text-muted-foreground"
            data-testid="back-to-audio-button"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Audio
          </Button>
          <div className="flex flex-col items-center gap-3 mt-3">
            <Button
              onClick={async () => {
                try {
                  await apiRequest('PATCH', `/api/projects/${projectId}`, {
                    makeCharacterSing
                  });
                  onNext();
                } catch (error) {
                  toast({
                    title: "Error",
                    description: "Failed to save preferences. Please try again.",
                    variant: "destructive",
                  });
                }
              }}
              disabled={!currentCharacterUrl}
              className={`floating-button py-4 px-8 text-base ${currentCharacterUrl ? 'button-glow' : ''}`}
              data-testid="proceed-to-scenes-button"
            >
              Continue
            </Button>
            <StepCircles currentStep={2} />
          </div>
        </div>
      </div>

      <CharacterLibraryModal
        isOpen={showLibraryModal}
        onClose={() => setShowLibraryModal(false)}
        onSelect={handleSavedCharacterSelected}
      />
      
      {currentCharacterUrl && currentCharacterPrompt && (
        <SaveCharacterModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          imageUrl={currentCharacterUrl}
          prompt={currentCharacterPrompt}
        />
      )}
    </div>
  );
}
