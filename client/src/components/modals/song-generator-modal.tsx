import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SongGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSongGenerated: (result: { audioUrl: string; duration: number }) => void;
  projectId: string;
}

const suggestedTags = ["pop", "electronic", "rock", "upbeat", "techno", "hip-hop", "country", "reggae"];

export function SongGeneratorModal({ isOpen, onClose, onSongGenerated, projectId }: SongGeneratorModalProps) {
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [duration, setDuration] = useState([60]); // Default 60 seconds
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const durationOptions = [30, 60, 90, 120];
  const getDurationLabel = (value: number) => {
    if (value === 30) return "30 sec";
    if (value === 60) return "1 min";
    if (value === 90) return "1.5 min";
    if (value === 120) return "2 min";
    return `${value} sec`;
  };

  const generateLyricsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-lyrics`, {
        description,
        duration: duration[0]
      });
      return response.json();
    },
    onSuccess: (data) => {
      setLyrics(data.lyrics);
      toast({
        title: "Success",
        description: "Lyrics generated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to generate lyrics",
        variant: "destructive",
      });
    }
  });

  const generateSongMutation = useMutation({
    mutationFn: async () => {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 1000);

      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-song`, {
        description,
        tags,
        lyrics,
        duration: duration[0]
      });

      clearInterval(progressInterval);
      setProgress(100);
      
      return response.json();
    },
    onSuccess: (data) => {
      onSongGenerated(data);
      handleClose();
      toast({
        title: "Success",
        description: "Song generated successfully!",
      });
    },
    onError: (error) => {
      setProgress(0);
      toast({
        title: "Error",
        description: "Failed to generate song",
        variant: "destructive",
      });
    }
  });

  const handleClose = () => {
    setDescription("");
    setTags("");
    setLyrics("");
    setDuration([60]);
    setProgress(0);
    onClose();
  };

  const addTag = (tag: string) => {
    const currentTags = tags.split(",").map(t => t.trim()).filter(Boolean);
    if (!currentTags.includes(tag)) {
      setTags(currentTags.concat(tag).join(", "));
    }
  };

  const canGenerate = description.trim().length > 10 && tags.trim().length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto" data-testid="song-generator-modal">
        <DialogHeader>
          <DialogTitle className="gradient-text">Generate AI Song</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Song Description */}
          <div>
            <Label className="flex items-center text-sm font-semibold mb-2">
              <i className="fas fa-lightbulb text-accent mr-2"></i>
              What is your song about?
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., A lonely cowboy cat riding through the desert at sunset..."
              rows={3}
              className="resize-none"
              data-testid="song-description-input"
            />
            <p className="text-xs text-muted-foreground mt-1">Describe the theme, mood, or story of your song</p>
          </div>

          {/* Song Duration */}
          <div>
            <Label className="flex items-center text-sm font-semibold mb-2">
              <i className="fas fa-clock text-accent mr-2"></i>
              Song Duration
            </Label>
            <div className="space-y-3">
              <div className="px-3">
                <Slider
                  value={duration}
                  onValueChange={setDuration}
                  max={120}
                  min={30}
                  step={30}
                  className="w-full"
                  data-testid="duration-slider"
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground px-1">
                {durationOptions.map(option => (
                  <span 
                    key={option}
                    className={duration[0] === option ? "text-primary font-medium" : ""}
                  >
                    {getDurationLabel(option)}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Current: {getDurationLabel(duration[0])}</p>
            </div>
          </div>

          {/* Tags */}
          <div>
            <Label className="flex items-center text-sm font-semibold mb-2">
              <i className="fas fa-tags text-primary mr-2"></i>
              Musical Style & Tags
            </Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., electronic, pop, female singer, upbeat, dreamy"
              data-testid="song-tags-input"
            />
            <p className="text-xs text-muted-foreground mt-1">Separate tags with commas</p>
            
            {/* Suggested Tags */}
            <div className="flex flex-wrap gap-2 mt-3">
              {suggestedTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => addTag(tag)}
                  className="text-xs bg-primary/20 text-primary px-2 py-1 rounded cursor-pointer hover:bg-primary/30 transition-colors"
                  data-testid={`tag-${tag}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Lyrics */}
          <div>
            <Label className="flex items-center text-sm font-semibold mb-2">
              <i className="fas fa-pencil-alt text-accent mr-2"></i>
              Lyrics
            </Label>
            <div className="space-y-3">
              <div className="flex space-x-3">
                <Button
                  variant="secondary"
                  onClick={() => generateLyricsMutation.mutate()}
                  disabled={!description.trim() || generateLyricsMutation.isPending}
                  className="flex-1"
                  data-testid="generate-lyrics-button"
                >
                  {generateLyricsMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Generating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-magic mr-2"></i>
                      Generate Lyrics
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLyrics("")}
                  className="flex-1"
                  data-testid="write-lyrics-button"
                >
                  <i className="fas fa-edit mr-2"></i>
                  Write My Own
                </Button>
              </div>
              <Textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Enter your lyrics here or click 'Generate Lyrics' to create them automatically..."
                rows={6}
                className="resize-none"
                data-testid="lyrics-textarea"
              />
            </div>
          </div>

          {/* Generation Progress */}
          {generateSongMutation.isPending && (
            <div className="bg-muted/30 rounded-lg p-4" data-testid="song-generation-progress">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold">Generating Song...</span>
                <div className="loading-spinner"></div>
              </div>
              <Progress value={progress} className="mb-2" />
              <p className="text-sm text-muted-foreground">
                {progress < 30 ? "Processing your request..." :
                 progress < 60 ? "Generating musical composition..." :
                 progress < 80 ? "Creating vocals..." :
                 progress < 100 ? "Mixing and mastering..." :
                 "Song generation complete!"}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="secondary" onClick={handleClose} data-testid="cancel-song-generation">
            Cancel
          </Button>
          <Button
            onClick={() => generateSongMutation.mutate()}
            disabled={!canGenerate || generateSongMutation.isPending}
            className="floating-button"
            data-testid="generate-song-button"
          >
            <i className="fas fa-magic mr-2"></i>
            Generate Song
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
