import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RefreshCw, Check } from "lucide-react";

interface CharacterGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCharacterGenerated: (result: { imageUrl: string; prompt: string }) => void;
  projectId: string;
}

const artStyles = [
  { id: "cartoon", name: "Cartoon", description: "Fun and animated" },
  { id: "realistic", name: "Realistic", description: "Photorealistic style" },
  { id: "anime", name: "Anime", description: "Japanese animation style" },
  { id: "3d", name: "3D Animation", description: "Modern 3D rendered style" }
];

export function CharacterGeneratorModal({ isOpen, onClose, onCharacterGenerated, projectId }: CharacterGeneratorModalProps) {
  const [description, setDescription] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("cartoon");
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const generateCharacterOptionsMutation = useMutation({
    mutationFn: async () => {
      const fullPrompt = `${description} in ${selectedStyle} style`;
      
      // Simulate progress updates
      setProgress(0);
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 5000); // Slower progress for longer generation time

      // Use different endpoints based on whether we have a project ID
      const endpoint = projectId 
        ? `/api/projects/${projectId}/generate-character-options`
        : `/api/characters/generate-options`;

      const response = await apiRequest("POST", endpoint, {
        prompt: fullPrompt,
        aspectRatio: "16:9"
      });

      clearInterval(progressInterval);
      setProgress(100);
      
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedImageUrls(data.imageUrls);
      setCurrentPrompt(data.prompt);
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
        // Save to project
        const response = await apiRequest("POST", `/api/projects/${projectId}/save-character-option`, {
          imageUrl,
          prompt: currentPrompt
        });
        return response.json();
      } else {
        // Save to character library
        const response = await apiRequest("POST", `/api/characters`, {
          imageUrl,
          prompt: currentPrompt,
          name: description || "AI Generated Character"
        });
        return response.json();
      }
    },
    onSuccess: (data, imageUrl) => {
      onCharacterGenerated({ imageUrl, prompt: currentPrompt });
      if (projectId) {
        toast({
          title: "Success",
          description: "Character saved to project! Modal will stay open so you can save more characters.",
        });
      } else {
        toast({
          title: "Success",
          description: "Character saved to your library! Modal will stay open so you can save more characters.",
        });
      }
      // Don't close modal - let user save multiple characters
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save character",
        variant: "destructive",
      });
    }
  });

  const saveToLibraryMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const response = await apiRequest("POST", "/api/characters", {
        imageUrl,
        prompt: currentPrompt,
        name: `Character ${Date.now()}`, // Generate a unique name
        style: selectedStyle
      });
      return response.json();
    },
    onSuccess: (data, imageUrl) => {
      toast({
        title: "Success",
        description: "Character saved to your library!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save character to library",
        variant: "destructive",
      });
    }
  });

  const handleSaveCharacter = (imageUrl: string) => {
    saveCharacterMutation.mutate(imageUrl);
  };

  const handleSaveToLibrary = (imageUrl: string) => {
    saveToLibraryMutation.mutate(imageUrl);
  };

  const handleClose = () => {
    setDescription("");
    setSelectedStyle("cartoon");
    setGeneratedImageUrls([]);
    setCurrentPrompt("");
    setProgress(0);
    onClose();
  };

  const canGenerate = description.trim().length > 10;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="character-generator-modal">
        <DialogHeader>
          <DialogTitle className="gradient-text">Generate AI Character</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Character Description */}
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
          </div>

          {/* Style Presets */}
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

          {/* Generation Progress */}
          {generateCharacterOptionsMutation.isPending && (
            <div className="bg-muted/30 rounded-lg p-4" data-testid="character-generation-progress">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold">Generating Character Options...</span>
                <div className="loading-spinner"></div>
              </div>
              <Progress value={progress} className="mb-2" />
              <p className="text-sm text-muted-foreground">Creating 4 character variations for you to choose from...</p>
            </div>
          )}

          {/* Generated Character Options */}
          {generatedImageUrls.length > 0 && (
            <div data-testid="generated-character-options">
              <Label className="flex items-center text-sm font-semibold mb-3">
                <i className="fas fa-images text-primary mr-2"></i>
                Choose Your Favorite Character ({generatedImageUrls.length} options)
              </Label>
              <div className="grid grid-cols-2 gap-4">
                {generatedImageUrls.map((imageUrl, index) => (
                  <div key={index} className="relative group" data-testid={`character-option-${index}`}>
                    <img
                      src={imageUrl}
                      alt={`Character option ${index + 1}`}
                      className="w-full h-48 rounded-lg object-cover border-2 border-border group-hover:border-primary transition-colors"
                      data-testid={`character-image-${index}`}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors"></div>
                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        onClick={() => handleSaveCharacter(imageUrl)}
                        disabled={saveCharacterMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                        data-testid={`save-character-${index}`}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Use for Project
                      </Button>
                      <Button
                        onClick={() => handleSaveToLibrary(imageUrl)}
                        disabled={saveToLibraryMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        size="sm"
                        data-testid={`save-to-library-${index}`}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Save to Library
                      </Button>
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
            Cancel
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