import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RefreshCw, Check, Sparkles, AlertTriangle, Crown } from "lucide-react";
import { Link } from "wouter";

interface CharacterGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCharacterGenerated: (result: { imageUrl: string; prompt: string }) => void;
  projectId: string;
}

interface CharacterLimitInfo {
  count: number;
  limit: number | null;
  isFreePlan: boolean;
  isAtLimit: boolean;
  canCreate: boolean;
}

const artStyles = [
  { id: "realistic", name: "Realistic", description: "Photorealistic (best for human characters)" },
  { id: "3d", name: "3D Animation", description: "Modern 3D rendered style" },
  { id: "radiant", name: "Radiant", description: "Vibrant characters, best for fictional characters" },
  { id: "cartoon", name: "Cartoon", description: "Animated cartoon style" },
  { id: "anime", name: "Anime", description: "Japanese anime style" },
  { id: "artistic", name: "Artistic", description: "Creative artistic style" }
];

export function CharacterGeneratorModal({ isOpen, onClose, onCharacterGenerated, projectId }: CharacterGeneratorModalProps) {
  const [description, setDescription] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("realistic");
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [generatedWithStyle, setGeneratedWithStyle] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [enhancingImageIndex, setEnhancingImageIndex] = useState<number | null>(null);
  const [enhancedIndices, setEnhancedIndices] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: limitInfo, refetch: refetchLimitInfo } = useQuery<CharacterLimitInfo>({
    queryKey: ['/api/characters/limit'],
    enabled: isOpen,
  });

  useEffect(() => {
    if (isOpen) {
      refetchLimitInfo();
    }
  }, [isOpen, refetchLimitInfo]);

  const generateCharacterOptionsMutation = useMutation({
    mutationFn: async () => {
      const fullPrompt = description;
      
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

      const endpoint = projectId 
        ? `/api/projects/${projectId}/generate-character-options`
        : `/api/characters/generate-options`;

      const response = await apiRequest("POST", endpoint, {
        prompt: fullPrompt,
        aspectRatio: "16:9",
        style: selectedStyle
      }, { timeout: 900000 });

      clearInterval(progressInterval);
      setProgress(100);
      
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedImageUrls(data.imageUrls);
      setCurrentPrompt(data.prompt);
      setGeneratedWithStyle(selectedStyle);
      setEnhancedIndices(new Set());
      toast({
        title: "Success",
        description: `Generated ${data.imageUrls.length} character options!`,
      });
    },
    onError: (error) => {
      setProgress(0);
      toast({
        title: "Error",
        description: "Failed to generate character options",
        variant: "destructive",
      });
    }
  });

  const saveCharacterMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      if (projectId) {
        const [projectResponse, libraryResponse] = await Promise.all([
          apiRequest("POST", `/api/projects/${projectId}/save-character-option`, {
            imageUrl,
            prompt: currentPrompt
          }),
          apiRequest("POST", `/api/characters`, {
            imageUrl,
            prompt: currentPrompt,
            name: description || "AI Generated Character",
            style: selectedStyle
          })
        ]);
        return {
          project: await projectResponse.json(),
          library: await libraryResponse.json()
        };
      } else {
        const response = await apiRequest("POST", `/api/characters`, {
          imageUrl,
          prompt: currentPrompt,
          name: description || "AI Generated Character"
        });
        return response.json();
      }
    },
    onSuccess: (data, imageUrl) => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      queryClient.invalidateQueries({ queryKey: ['/api/characters/limit'] });
      onCharacterGenerated({ imageUrl, prompt: currentPrompt });
      if (projectId) {
        toast({
          title: "Success",
          description: "Character saved to project and your library!",
        });
        handleClose();
      } else {
        toast({
          title: "Success",
          description: "Character saved to your library!",
        });
        handleClose();
      }
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

  const saveToLibraryMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const response = await apiRequest("POST", "/api/characters", {
        imageUrl,
        prompt: currentPrompt,
        name: `Character ${Date.now()}`,
        style: selectedStyle
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

  const hyperRealMutation = useMutation({
    mutationFn: async ({ imageUrl, index }: { imageUrl: string; index: number }) => {
      setEnhancingImageIndex(index);
      const response = await apiRequest("POST", "/api/characters/enhance-hyper-real", {
        imageUrl,
        prompt: currentPrompt
      }, { timeout: 600000 });
      return response.json();
    },
    onSuccess: (data, { imageUrl: originalImageUrl, index }) => {
      setGeneratedImageUrls(prev => 
        prev.map((url, i) => i === index ? data.enhancedImageUrl : url)
      );
      setEnhancingImageIndex(null);
      setEnhancedIndices(prev => new Set(prev).add(index));
      toast({
        title: "Success",
        description: "Character enhanced to hyper real!",
      });
    },
    onError: (error) => {
      setEnhancingImageIndex(null);
      toast({
        title: "Error",
        description: "Failed to enhance character to hyper real",
        variant: "destructive",
      });
    }
  });

  const handleMakeHyperReal = (imageUrl: string, index: number) => {
    hyperRealMutation.mutate({ imageUrl, index });
  };

  const handleSaveCharacter = (imageUrl: string) => {
    saveCharacterMutation.mutate(imageUrl);
  };

  const handleSaveToLibrary = (imageUrl: string) => {
    saveToLibraryMutation.mutate(imageUrl);
  };

  const handleClose = () => {
    setDescription("");
    setSelectedStyle("realistic");
    setGeneratedImageUrls([]);
    setCurrentPrompt("");
    setGeneratedWithStyle(null);
    setProgress(0);
    setEnhancingImageIndex(null);
    setEnhancedIndices(new Set());
    onClose();
  };

  const canGenerate = description.trim().length > 10;
  const isSaveDisabled = limitInfo?.isAtLimit && limitInfo?.isFreePlan;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="character-generator-modal">
        <DialogHeader>
          <DialogTitle className="gradient-text">Generate AI Character</DialogTitle>
          <p className="text-sm text-muted-foreground">Character image generation is <span className="text-green-500 font-semibold">free</span>.</p>
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
                  <Link href="/plans" onClick={handleClose}>
                    <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 whitespace-nowrap">
                      <Crown className="h-3 w-3 mr-1" />
                      Upgrade
                    </Button>
                  </Link>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label className="flex items-center text-sm font-semibold mb-2">
              <i className="fas fa-user text-primary mr-2"></i>
              Describe Your Character
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., A cyberpunk cat with neon blue fur, wearing futuristic goggles and a leather jacket..."
              rows={4}
              className="resize-none"
              data-testid="character-description-input"
            />
            <p className="text-xs text-muted-foreground mt-1">Be detailed about appearance, style, clothing, and mood</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">For best results, make sure only 1 character is shown. Front shots from waist up are also better than full body shots</p>
          </div>

          <div>
            <Label className="flex items-center text-sm font-semibold mb-3">
              <i className="fas fa-palette text-accent mr-2"></i>
              Art Style
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {artStyles.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={cn(
                    "p-3 border rounded-lg text-left transition-colors",
                    selectedStyle === style.id 
                      ? "border-primary bg-primary/10" 
                      : "border-border hover:border-primary"
                  )}
                  data-testid={`style-${style.id}`}
                >
                  <div className="font-semibold text-sm">{style.name}</div>
                  <div className="text-xs text-muted-foreground">{style.description}</div>
                </button>
              ))}
            </div>
          </div>

          {generateCharacterOptionsMutation.isPending && (
            <div className="bg-muted/30 rounded-lg p-4" data-testid="character-generation-progress">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold">Generating Character Options...</span>
                <div className="loading-spinner"></div>
              </div>
              <Progress value={progress} className="mb-2" />
              <p className="text-sm text-muted-foreground">Creating your character...</p>
            </div>
          )}

          {generatedImageUrls.length > 0 && (
            <div data-testid="generated-character-options">
              <Label className="flex items-center text-sm font-semibold mb-3">
                <i className="fas fa-images text-primary mr-2"></i>
                {generatedImageUrls.length > 1 ? `Choose Your Favorite Character (${generatedImageUrls.length} options)` : 'Your Generated Character'}
              </Label>
              <div className={generatedImageUrls.length === 1 ? "flex justify-center" : "grid grid-cols-2 gap-4"}>
                {generatedImageUrls.map((imageUrl, index) => (
                  <div key={index} className={generatedImageUrls.length === 1 ? "relative group max-w-md" : "relative group"} data-testid={`character-option-${index}`}>
                    <img
                      src={imageUrl}
                      alt={`Character option ${index + 1}`}
                      className={generatedImageUrls.length === 1 ? "w-full h-96 rounded-lg object-cover border-2 border-border group-hover:border-primary transition-colors" : "w-full h-48 rounded-lg object-cover border-2 border-border group-hover:border-primary transition-colors"}
                      data-testid={`character-image-${index}`}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors"></div>
                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex flex-wrap justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {generatedWithStyle === "realistic" && !enhancedIndices.has(index) && (
                        <Button
                          onClick={() => handleMakeHyperReal(imageUrl, index)}
                          disabled={enhancingImageIndex !== null}
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                          size="sm"
                          data-testid={`make-hyper-real-${index}`}
                        >
                          <Sparkles className="w-4 h-4 mr-1" />
                          {enhancingImageIndex === index ? "Enhancing..." : "Make Hyper Real"}
                        </Button>
                      )}
                      {projectId ? (
                        <>
                          <Button
                            onClick={() => handleSaveCharacter(imageUrl)}
                            disabled={saveCharacterMutation.isPending || isSaveDisabled}
                            className="bg-green-600 hover:bg-green-700 text-white"
                            size="sm"
                            title={isSaveDisabled ? "Character limit reached - upgrade to save more" : ""}
                            data-testid={`save-character-${index}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Use for Project
                          </Button>
                          <Button
                            onClick={() => handleSaveToLibrary(imageUrl)}
                            disabled={saveToLibraryMutation.isPending || isSaveDisabled}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            size="sm"
                            title={isSaveDisabled ? "Character limit reached - upgrade to save more" : ""}
                            data-testid={`save-to-library-${index}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Save to Library
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={() => handleSaveCharacter(imageUrl)}
                          disabled={saveCharacterMutation.isPending || isSaveDisabled}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          size="sm"
                          title={isSaveDisabled ? "Character limit reached - upgrade to save more" : ""}
                          data-testid={`save-character-${index}`}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Save Character
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center mt-4">
                <Button
                  onClick={() => generateCharacterOptionsMutation.mutate()}
                  disabled={generateCharacterOptionsMutation.isPending}
                  variant="outline"
                  size="sm"
                  data-testid="regenerate-all-characters"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generate New Options
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="secondary" onClick={handleClose} data-testid="cancel-character-generation">
            Exit
          </Button>
          
          {generatedImageUrls.length === 0 && (
            <Button
              onClick={() => generateCharacterOptionsMutation.mutate()}
              disabled={!canGenerate || generateCharacterOptionsMutation.isPending}
              className="floating-button"
              data-testid="generate-character-button"
            >
              <i className="fas fa-sparkles mr-2"></i>
              Generate Options
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
