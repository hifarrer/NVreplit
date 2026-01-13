import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CharacterGeneratorModal } from "@/components/modals/character-generator-modal";
import { CharacterLibraryModal } from "@/components/modals/character-library-modal";
import { SaveCharacterModal } from "@/components/modals/save-character-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RotateCcw, Images, Image, User, Upload, Sparkles, Bot, UserCheck, Bookmark, ArrowLeft, ArrowRight, Music, Loader2 } from "lucide-react";
import { StepCircles } from "@/components/ui/step-circles";

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
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("library");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold gradient-text mb-2">Create Your Character</h3>
          <p className="text-muted-foreground text-sm">Upload an image, generate an AI character, or choose from your saved characters</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-transparent border-b border-border rounded-none h-auto p-0 mb-6">
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
            <TabsTrigger 
              value="generate" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 text-base font-medium transition-colors"
              data-testid="tab-generate"
            >
              Generate
            </TabsTrigger>
          </TabsList>

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
            <div className="py-4">
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
                className="w-full floating-button mt-6"
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
            </div>
          </TabsContent>

          <TabsContent value="generate" className="mt-0">
            <div className="text-center py-8">
              <Bot className="w-16 h-16 text-accent mb-4 mx-auto" />
              <h4 className="text-lg font-semibold mb-2">Generate AI Character</h4>
              <p className="text-muted-foreground mb-6 text-sm">Create a unique character using AI image generation</p>
              <Button 
                onClick={() => setShowCharacterModal(true)}
                className="floating-button px-8"
                data-testid="generate-character-button"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Character
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {currentCharacterUrl && (
          <div className="mt-6 p-4 sm:p-6 media-player rounded-lg" data-testid="character-preview-section">
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCharacterModal(true)}
                  className="text-sm text-primary hover:underline"
                  data-testid="regenerate-character-button"
                >
                  Generate another
                </Button>
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
