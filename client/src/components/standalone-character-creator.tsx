import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CharacterLibraryModal } from "@/components/modals/character-library-modal";
import { SaveCharacterModal } from "@/components/modals/save-character-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Images, User, Upload, Sparkles, Bookmark, Loader2, Check, AlertTriangle, Crown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface StandaloneCharacterCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onCharacterGenerated: (result: { imageUrl: string; prompt: string }) => void;
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

export function StandaloneCharacterCreator({ isOpen, onClose, onCharacterGenerated }: StandaloneCharacterCreatorProps) {
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
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

  const handleSavedCharacterSelected = async (character: { imageUrl: string; prompt: string }) => {
    try {
      setCurrentCharacterUrl(character.imageUrl);
      setCurrentCharacterPrompt(character.prompt);
      onCharacterGenerated(character);
      toast({
        title: "Character loaded",
        description: "Your saved character has been loaded successfully!",
      });
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
    saveCharacterMutation.mutate(imageUrl);
  };

  const canGenerate = prompt.trim().length > 10 && selectedStyle !== null;
  const isSaveDisabled = limitInfo?.isAtLimit && limitInfo?.isFreePlan;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="gradient-text">Create Character</DialogTitle>
        </DialogHeader>

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
                  <Link href="/plans" onClick={onClose}>
                    <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 whitespace-nowrap">
                      <Crown className="h-3 w-3 mr-1" />
                      Upgrade
                    </Button>
                  </Link>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-transparent border-b border-border rounded-none h-auto p-0 mb-6">
              <TabsTrigger 
                value="generate" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 text-base font-medium transition-colors"
              >
                Generate
              </TabsTrigger>
              <TabsTrigger 
                value="library" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 text-base font-medium transition-colors"
              >
                Library
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
                                data-testid={`save-character-${index}`}
                              >
                                <Check className="w-4 h-4 mr-1" />
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
                              data-testid={`save-character-${index}`}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Save to Library
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="library" className="mt-0">
              <div className="text-center py-8">
                <img 
                  src="https://res.cloudinary.com/dqemas8ht/image/upload/v1767383314/characters_bsaw13.png" 
                  alt="Character Library" 
                  className="w-48 sm:w-96 h-auto mx-auto mb-4 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setShowLibraryModal(true)}
                />
                <h4 className="text-lg font-semibold mb-2">Character Library</h4>
                <p className="text-muted-foreground mb-6 text-sm">Choose from public or your saved characters</p>
                <Button 
                  onClick={() => setShowLibraryModal(true)}
                  className="floating-button px-8"
                >
                  <Images className="w-4 h-4 mr-2" />
                  Open Library
                </Button>
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
                        <div className="grid grid-cols-2 gap-4">
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
                            Save to Library
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
                            Save to Library
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
                          Save to Library
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
                          Save to Library
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>

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
    </Dialog>
  );
}
