import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "@/components/ui/audio-player";
import { SongGeneratorModal } from "@/components/modals/song-generator-modal";
import { useToast } from "@/hooks/use-toast";

interface AudioCreationStepProps {
  projectId: string;
  audioUrl?: string;
  onNext: () => void;
}

export function AudioCreationStep({ projectId, audioUrl, onNext }: AudioCreationStepProps) {
  const [showSongModal, setShowSongModal] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState(audioUrl);
  const { toast } = useToast();

  const handleAudioUpload = () => {
    // TODO: Implement file upload functionality
    toast({
      title: "Feature Coming Soon",
      description: "Audio upload functionality will be implemented soon.",
    });
  };

  const handleSongGenerated = (result: { audioUrl: string; duration: number }) => {
    setCurrentAudioUrl(result.audioUrl);
    toast({
      title: "Success",
      description: "Your song has been generated successfully!",
    });
  };

  return (
    <div className="max-w-4xl mx-auto mb-12" data-testid="audio-creation-step">
      <div className="bg-card border border-border rounded-lg p-8">
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold gradient-text mb-4">Create Your Music</h3>
          <p className="text-muted-foreground">Choose how you want to create the soundtrack for your music video</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Upload Audio Option */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold flex items-center">
              <i className="fas fa-upload text-primary mr-2"></i>
              Upload Audio File
            </h4>
            
            <div className="upload-zone rounded-lg p-12 text-center cursor-pointer" data-testid="audio-upload-zone">
              <i className="fas fa-music text-4xl text-muted-foreground mb-4"></i>
              <p className="text-muted-foreground mb-2">Drag and drop your audio file here</p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
              <p className="text-xs text-muted-foreground mt-2">Supports MP3, WAV, AAC (Max 10MB)</p>
            </div>

            <Button 
              onClick={handleAudioUpload}
              className="w-full floating-button"
              data-testid="upload-audio-button"
            >
              <i className="fas fa-upload mr-2"></i>
              Upload Audio
            </Button>
          </div>

          {/* Generate Song Option */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold flex items-center">
              <i className="fas fa-magic text-accent mr-2"></i>
              Generate with AI
            </h4>
            
            <div className="bg-muted/30 rounded-lg p-8 text-center">
              <i className="fas fa-robot text-4xl text-accent mb-4"></i>
              <p className="text-muted-foreground mb-4">Create a unique song using AI based on your description and preferences</p>
              <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                <li>• Describe your song concept</li>
                <li>• Choose musical style and tags</li>
                <li>• Generate or write custom lyrics</li>
              </ul>
            </div>

            <Button 
              onClick={() => setShowSongModal(true)}
              className="w-full floating-button"
              data-testid="generate-song-button"
            >
              <i className="fas fa-magic mr-2"></i>
              Generate Song
            </Button>
          </div>
        </div>

        {/* Current Audio Display */}
        {currentAudioUrl && (
          <div className="mt-8">
            <AudioPlayer audioUrl={currentAudioUrl} title="Your Generated Song" />
          </div>
        )}

        {/* Next Step Button */}
        <div className="text-center mt-8">
          <Button
            onClick={onNext}
            disabled={!currentAudioUrl}
            className="floating-button text-lg py-3 px-8"
            data-testid="continue-to-character-button"
          >
            <i className="fas fa-arrow-right mr-2"></i>
            Continue to Character Creation
          </Button>
        </div>
      </div>

      <SongGeneratorModal
        isOpen={showSongModal}
        onClose={() => setShowSongModal(false)}
        onSongGenerated={handleSongGenerated}
        projectId={projectId}
      />
    </div>
  );
}
