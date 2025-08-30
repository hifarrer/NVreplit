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

interface CharacterGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCharacterGenerated: (result: { imageUrl: string }) => void;
  projectId: string;
}

const artStyles = [
  { id: "cartoon", name: "Cartoon", description: "Fun and animated" },
  { id: "realistic", name: "Realistic", description: "Photorealistic style" },
  { id: "anime", name: "Anime", description: "Japanese animation style" },
  { id: "pixel", name: "Pixel Art", description: "Retro 8-bit style" }
];

export function CharacterGeneratorModal({ isOpen, onClose, onCharacterGenerated, projectId }: CharacterGeneratorModalProps) {
  const [description, setDescription] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("cartoon");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const generateCharacterMutation = useMutation({
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
      }, 2000);

      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-character`, {
        prompt: fullPrompt
      });

      clearInterval(progressInterval);
      setProgress(100);
      
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedImageUrl(data.imageUrl);
      toast({
        title: "Success",
        description: "Character generated successfully!",
      });
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

  const handleSaveCharacter = () => {
    if (generatedImageUrl) {
      onCharacterGenerated({ imageUrl: generatedImageUrl });
      handleClose();
    }
  };

  const handleClose = () => {
    setDescription("");
    setSelectedStyle("cartoon");
    setGeneratedImageUrl("");
    setProgress(0);
    onClose();
  };

  const canGenerate = description.trim().length > 10;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl" data-testid="character-generator-modal">
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
          {generateCharacterMutation.isPending && (
            <div className="bg-muted/30 rounded-lg p-4" data-testid="character-generation-progress">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold">Generating Character...</span>
                <div className="loading-spinner"></div>
              </div>
              <Progress value={progress} className="mb-2" />
              <p className="text-sm text-muted-foreground">Creating your character...</p>
            </div>
          )}

          {/* Generated Character Preview */}
          {generatedImageUrl && (
            <div className="text-center" data-testid="generated-character-preview">
              <div className="relative inline-block">
                <img
                  src={generatedImageUrl}
                  alt="Generated character"
                  className="w-48 h-48 rounded-lg object-cover border-2 border-primary mx-auto"
                  data-testid="generated-character-image"
                />
                <Button
                  onClick={() => generateCharacterMutation.mutate()}
                  size="sm"
                  className="absolute top-2 right-2 w-8 h-8 p-0 bg-black/50 backdrop-blur-sm rounded-full hover:bg-black/70"
                  data-testid="regenerate-character-button"
                >
                  <i className="fas fa-redo text-xs" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-3">Click the refresh button to generate another variation</p>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="secondary" onClick={handleClose} data-testid="cancel-character-generation">
            Cancel
          </Button>
          
          {!generatedImageUrl ? (
            <Button
              onClick={() => generateCharacterMutation.mutate()}
              disabled={!canGenerate || generateCharacterMutation.isPending}
              className="floating-button"
              data-testid="generate-character-button"
            >
              <i className="fas fa-sparkles mr-2"></i>
              Generate Character
            </Button>
          ) : (
            <Button
              onClick={handleSaveCharacter}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="save-character-button"
            >
              <i className="fas fa-check mr-2"></i>
              Save Character
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
