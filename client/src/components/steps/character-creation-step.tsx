import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CharacterGeneratorModal } from "@/components/modals/character-generator-modal";
import { CharacterLibraryModal } from "@/components/modals/character-library-modal";
import { SaveCharacterModal } from "@/components/modals/save-character-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RotateCcw } from "lucide-react";

interface CharacterCreationStepProps {
  projectId: string;
  characterImageUrl?: string;
  onNext: () => void;
  onBack: () => void;
}

export function CharacterCreationStep({ projectId, characterImageUrl, onNext, onBack }: CharacterCreationStepProps) {
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [currentCharacterUrl, setCurrentCharacterUrl] = useState(characterImageUrl);
  const [currentCharacterPrompt, setCurrentCharacterPrompt] = useState('');
  const { toast } = useToast();

  const handleCharacterUpload = () => {
    // TODO: Implement file upload functionality
    toast({
      title: "Feature Coming Soon",
      description: "Character image upload functionality will be implemented soon.",
    });
  };

  const handleCharacterGenerated = (result: { imageUrl: string; prompt: string }) => {
    setCurrentCharacterUrl(result.imageUrl);
    setCurrentCharacterPrompt(result.prompt);
    toast({
      title: "Success",
      description: "Your character has been generated successfully!",
    });
  };

  const handleSavedCharacterSelected = async (character: { imageUrl: string; prompt: string }) => {
    try {
      // Save the selected character to the current project
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

  return (
    <div className="max-w-4xl mx-auto mb-12" data-testid="character-creation-step">
      <div className="bg-card border border-border rounded-lg p-8">
        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2"
            data-testid="start-over-button"
          >
            <RotateCcw className="w-4 h-4" />
            Start over
          </Button>
        </div>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold gradient-text mb-4">Create Your Character</h3>
          <p className="text-muted-foreground">Upload an image, generate an AI character, or choose from your saved characters</p>
        </div>

        {/* Character Library Section */}
        <div className="mb-8">
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setShowLibraryModal(true)}
              className="hover:bg-muted/50"
              data-testid="button-character-library"
            >
              <i className="fas fa-images mr-2"></i>
              My Character Library
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Upload Character Image */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold flex items-center">
              <i className="fas fa-image text-primary mr-2"></i>
              Upload Character Image
            </h4>
            
            <div className="upload-zone rounded-lg p-12 text-center cursor-pointer" data-testid="character-upload-zone">
              <i className="fas fa-user text-4xl text-muted-foreground mb-4"></i>
              <p className="text-muted-foreground mb-2">Drag and drop your character image</p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
              <p className="text-xs text-muted-foreground mt-2">PNG, JPG, GIF (Max 5MB)</p>
            </div>

            <Button 
              onClick={handleCharacterUpload}
              className="w-full floating-button"
              data-testid="upload-character-button"
            >
              <i className="fas fa-upload mr-2"></i>
              Upload Character
            </Button>
          </div>

          {/* Generate Character */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold flex items-center">
              <i className="fas fa-sparkles text-accent mr-2"></i>
              Generate AI Character
            </h4>
            
            <div className="bg-muted/30 rounded-lg p-8 text-center">
              <i className="fas fa-robot text-4xl text-accent mb-4"></i>
              <p className="text-muted-foreground mb-4">Create a unique character using AI image generation</p>
              <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                <li>• Describe your character's appearance</li>
                <li>• Specify style and mood</li>
                <li>• Generate variations until perfect</li>
              </ul>
            </div>

            <Button 
              onClick={() => setShowCharacterModal(true)}
              className="w-full floating-button"
              data-testid="generate-character-button"
            >
              <i className="fas fa-sparkles mr-2"></i>
              Generate Character
            </Button>
          </div>
        </div>

        {/* Character Preview */}
        {currentCharacterUrl && (
          <div className="mt-8 p-6 media-player rounded-lg" data-testid="character-preview-section">
            <h4 className="text-lg font-semibold mb-4 flex items-center">
              <i className="fas fa-user-check text-primary mr-2"></i>
              Your Character
            </h4>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <img 
                  src={currentCharacterUrl}
                  alt="Generated character" 
                  className="w-24 h-24 rounded-lg object-cover border-2 border-primary" 
                  data-testid="character-preview-image"
                />
                <div>
                  <p className="font-semibold" data-testid="character-description">AI Generated Character</p>
                  <p className="text-sm text-muted-foreground">Generated with AI</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCharacterModal(true)}
                    className="text-sm text-primary hover:underline mt-1 p-0 h-auto"
                    data-testid="regenerate-character-button"
                  >
                    Generate another
                  </Button>
                </div>
              </div>
              
              {/* Save Character Button */}
              {currentCharacterPrompt && (
                <Button
                  variant="outline"
                  onClick={() => setShowSaveModal(true)}
                  className="hover:bg-muted/50"
                  data-testid="button-save-character"
                >
                  <i className="fas fa-bookmark mr-2"></i>
                  Save Character
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button 
            variant="secondary"
            onClick={onBack}
            data-testid="back-to-audio-button"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Back to Audio
          </Button>
          <Button
            onClick={onNext}
            disabled={!currentCharacterUrl}
            className="floating-button py-3 px-8"
            data-testid="proceed-to-scenes-button"
          >
            <i className="fas fa-arrow-right mr-2"></i>
            Generate Video Scenes
          </Button>
        </div>
      </div>

      <CharacterGeneratorModal
        isOpen={showCharacterModal}
        onClose={() => setShowCharacterModal(false)}
        onCharacterGenerated={handleCharacterGenerated}
        projectId={projectId}
      />
      
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
