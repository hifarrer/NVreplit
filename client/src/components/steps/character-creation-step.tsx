import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CharacterGeneratorModal } from "@/components/modals/character-generator-modal";
import { CharacterLibraryModal } from "@/components/modals/character-library-modal";
import { SaveCharacterModal } from "@/components/modals/save-character-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RotateCcw, Images, Image, User, Upload, Sparkles, Bot, UserCheck, Bookmark, ArrowLeft, ArrowRight, Music } from "lucide-react";

interface CharacterCreationStepProps {
  projectId: string;
  characterImageUrl?: string;
  makeCharacterSing?: boolean;
  onNext: () => void;
  onBack: () => void;
  onReset: () => void;
}

export function CharacterCreationStep({ projectId, characterImageUrl, makeCharacterSing: initialMakeCharacterSing, onNext, onBack, onReset }: CharacterCreationStepProps) {
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [currentCharacterUrl, setCurrentCharacterUrl] = useState(characterImageUrl);
  const [currentCharacterPrompt, setCurrentCharacterPrompt] = useState('');
  const [makeCharacterSing, setMakeCharacterSing] = useState(initialMakeCharacterSing ?? true);
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
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold gradient-text mb-4">Create Your Character</h3>
          <p className="text-muted-foreground">Upload an image, generate an AI character, or choose from your saved characters</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* My Character Library */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold flex items-center">
              <Images className="w-4 h-4 text-primary mr-2" />
              My Character Library
            </h4>
            
            <div className="bg-muted/30 rounded-lg p-6 sm:p-8 text-center">
              <Images className="w-12 h-12 text-primary mb-4 mx-auto" />
              <p className="text-muted-foreground mb-4">Choose from your saved characters</p>
              <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                <li>• Access your character library</li>
                <li>• Browse saved characters</li>
                <li>• Select and use instantly</li>
              </ul>
            </div>

            <Button 
              onClick={() => setShowLibraryModal(true)}
              className="w-full floating-button"
              data-testid="button-character-library"
            >
              <Images className="w-4 h-4 mr-2" />
              My Character Library
            </Button>
          </div>

          {/* Upload Character Image */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold flex items-center">
              <Image className="w-4 h-4 text-primary mr-2" />
              Upload Character Image
            </h4>
            
            <div className="upload-zone rounded-lg p-6 sm:p-8 text-center cursor-pointer" data-testid="character-upload-zone">
              <User className="w-12 h-12 text-muted-foreground mb-4 mx-auto" />
              <p className="text-muted-foreground mb-2">Drag and drop your character image</p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
              <p className="text-xs text-muted-foreground mt-2">PNG, JPG, GIF (Max 5MB)</p>
            </div>

            <Button 
              onClick={handleCharacterUpload}
              className="w-full floating-button"
              data-testid="upload-character-button"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Character
            </Button>
          </div>

          {/* Generate AI Character */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold flex items-center">
              <Sparkles className="w-4 h-4 text-accent mr-2" />
              Generate AI Character
            </h4>
            
            <div className="bg-muted/30 rounded-lg p-6 sm:p-8 text-center">
              <Bot className="w-12 h-12 text-accent mb-4 mx-auto" />
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
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Character
            </Button>
          </div>
        </div>

        {/* Character Preview */}
        {currentCharacterUrl && (
          <div className="mt-8 p-6 media-player rounded-lg" data-testid="character-preview-section">
            <h4 className="text-lg font-semibold mb-4 flex items-center">
              <UserCheck className="w-4 h-4 text-primary mr-2" />
              Your Character
            </h4>
            <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:space-x-6">
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
                  <Bookmark className="w-4 h-4 mr-2" />
                  Save Character
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Make Character Sing Toggle */}
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

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button 
            variant="secondary"
            onClick={onBack}
            data-testid="back-to-audio-button"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Audio
          </Button>
          <Button
            onClick={async () => {
              // Save the makeCharacterSing preference before proceeding
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
            className="floating-button py-3 px-8"
            data-testid="proceed-to-scenes-button"
          >
            <ArrowRight className="w-4 h-4 mr-2" />
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
