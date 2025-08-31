import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "@/components/ui/audio-player";
import { SongGeneratorModal } from "@/components/modals/song-generator-modal";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Upload, Music } from "lucide-react";

interface AudioCreationStepProps {
  projectId: string;
  audioUrl?: string;
  onNext: () => void;
}

export function AudioCreationStep({ projectId, audioUrl, onNext }: AudioCreationStepProps) {
  const [showSongModal, setShowSongModal] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState(audioUrl);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadAudioMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('audio', file);
      
      const response = await fetch(`/api/projects/${projectId}/upload-audio`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentAudioUrl(data.audioUrl);
      setIsUploading(false);
      toast({
        title: "Success",
        description: `Audio file "${data.originalName}" uploaded successfully!`,
      });
    },
    onError: (error) => {
      setIsUploading(false);
      toast({
        title: "Upload Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File) => {
    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/mp3'];
    const isValidType = allowedTypes.includes(file.type) || 
                       file.name.match(/\.(mp3|wav|aac)$/i);
    
    if (!isValidType) {
      toast({
        title: "Invalid File Type",
        description: "Please select an MP3, WAV, or AAC audio file.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    uploadAudioMutation.mutate(file);
  };

  const handleAudioUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
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
              <Upload className="w-5 h-5 text-primary mr-2" />
              Upload Audio File
            </h4>
            
            <div 
              className={`upload-zone rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragOver ? 'border-primary bg-primary/10' : ''
              } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
              data-testid="audio-upload-zone"
              onClick={handleAudioUpload}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Music className="w-12 h-12 text-muted-foreground mb-4 mx-auto" />
              {isUploading ? (
                <p className="text-muted-foreground mb-2">Uploading audio file...</p>
              ) : (
                <>
                  <p className="text-muted-foreground mb-2">Drag and drop your audio file here</p>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                </>
              )}
              <p className="text-xs text-muted-foreground mt-2">Supports MP3, WAV, AAC (Max 10MB)</p>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.aac,audio/*"
              onChange={handleFileInputChange}
              className="hidden"
            />

            <Button 
              onClick={handleAudioUpload}
              disabled={isUploading}
              className="w-full floating-button"
              data-testid="upload-audio-button"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? 'Uploading...' : 'Upload Audio'}
            </Button>
          </div>

          {/* Generate Song Option */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold flex items-center">
              <Music className="w-5 h-5 text-accent mr-2" />
              Generate with AI
            </h4>
            
            <div className="bg-muted/30 rounded-lg p-8 text-center">
              <Music className="w-12 h-12 text-accent mb-4 mx-auto" />
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
              <Music className="w-4 h-4 mr-2" />
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
