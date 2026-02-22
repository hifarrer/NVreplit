import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Subtitles, Tags, AlertTriangle } from "lucide-react";
import { validateLyricsDuration } from "@shared/lyricsValidation";

interface SongGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSongGenerated: (result: { audioUrl: string; duration: number }) => void;
  projectId: string;
}

const suggestedTags = [
  "pop",
  "electronic",
  "rock",
  "upbeat",
  "hip-hop",
  "country",
  "reggae",
];

export function SongGeneratorModal({
  isOpen,
  onClose,
  onSongGenerated,
  projectId,
}: SongGeneratorModalProps) {
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [duration, setDuration] = useState([60]); // Default 1 minute (60 seconds)
  const [addSubtitles, setAddSubtitles] = useState(false); // Disabled by default
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [progress, setProgress] = useState(0);
  const [generatedSubtitles, setGeneratedSubtitles] = useState<string | null>(
    null,
  );
  const { toast } = useToast();
  const { user } = useAuth();

  // Check if user is paid (has a plan with monthly price > 0)
  const isPaidUser = user?.plan && user.plan.monthlyPrice > 0;

  // Check if user is Premium (can disable watermark)
  const isPremiumUser = user?.plan?.name === "Premium";

  // Validate lyrics length against duration
  const lyricsValidation = useMemo(() => {
    if (!lyrics || lyrics.trim().length === 0) {
      return { isValid: true, wordCount: 0, maxWordsAllowed: 0, message: undefined };
    }
    return validateLyricsDuration(lyrics, duration[0]);
  }, [lyrics, duration]);

  // Duration options based on user plan
  const durationOptions = isPaidUser
    ? [30, 60, 90, 120, 150, 180]
    : [30, 60, 90, 120];

  const maxDuration = isPaidUser ? 180 : 120;

  // Reset duration to 60 seconds when modal opens
  useEffect(() => {
    if (isOpen) {
      setDuration([60]);
    }
  }, [isOpen]);

  const getDurationLabel = (value: number) => {
    // Song generation is free, video generation is 1000 credits per 30 seconds
    const videoCredits = Math.ceil(value / 30) * 1000;

    if (value === 30) return `30 sec (${videoCredits} credits for video)`;
    if (value === 60) return `1 min (${videoCredits} credits for video)`;
    if (value === 90) return `1.5 min (${videoCredits} credits for video)`;
    if (value === 120) return `2 min (${videoCredits} credits for video)`;
    if (value === 150) return `2.5 min (${videoCredits} credits for video)`;
    if (value === 180) return `3 min (${videoCredits} credits for video)`;
    return `${value} sec (${videoCredits} credits for video)`;
  };

  const generateLyricsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/projects/${projectId}/generate-lyrics`,
        {
          description,
          duration: duration[0],
        },
      );
      return response.json();
    },
    onSuccess: (data) => {
      setLyrics(data.lyrics);
      setSongTitle(data.title || "");
      toast({
        title: "Success",
        description: "Lyrics and title generated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to generate lyrics",
        variant: "destructive",
      });
    },
  });

  const generateSongMutation = useMutation({
    mutationFn: async () => {
      // Simulate progress updates (slower for Minimax model)
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 5;
        });
      }, 2000);

      const response = await apiRequest(
        "POST",
        `/api/projects/${projectId}/generate-song`,
        {
          description,
          tags,
          lyrics,
          songTitle,
          duration: duration[0],
          addSubtitles: addSubtitles,
          includeWatermark: includeWatermark,
        },
      );

      clearInterval(progressInterval);
      setProgress(100);

      return response.json();
    },
    onSuccess: (data) => {
      onSongGenerated(data);

      // Store generated subtitles content for debugging display
      if (data.generatedSubtitlesContent) {
        setGeneratedSubtitles(data.generatedSubtitlesContent);
      }

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
    },
  });

  const handleClose = () => {
    setDescription("");
    setTags("");
    setLyrics("");
    setSongTitle("");
    setDuration([60]);
    setAddSubtitles(false);
    setIncludeWatermark(true);
    setProgress(0);
    setGeneratedSubtitles(null);
    onClose();
  };

  const addTag = (tag: string) => {
    const currentTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!currentTags.includes(tag)) {
      setTags(currentTags.concat(tag).join(", "));
    }
  };

  const canGenerate = description.trim().length >= 5 && tags.trim().length > 0 && lyricsValidation.isValid;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-auto"
        data-testid="song-generator-modal"
      >
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
              className={`resize-none ${description.trim().length > 0 && description.trim().length < 5 ? "border-red-500" : ""}`}
              data-testid="song-description-input"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {description.trim().length > 0 &&
              description.trim().length < 5 ? (
                <span className="text-red-500">
                  Description must be at least 5 characters
                </span>
              ) : description.trim().length >= 5 && tags.trim().length === 0 ? (
                <span className="text-orange-500">
                  Good! Now add at least one tag below to enable generation
                </span>
              ) : (
                "Describe the theme, mood, or story of your song"
              )}
            </p>
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
                  max={maxDuration}
                  min={30}
                  step={30}
                  defaultValue={[60]}
                  className="w-full"
                  data-testid="duration-slider"
                  key={`duration-slider-${isOpen}`}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground px-1 flex-wrap gap-1">
                {durationOptions.map((option) => (
                  <span
                    key={option}
                    className={
                      duration[0] === option ? "text-primary font-medium" : ""
                    }
                  >
                    {getDurationLabel(option)}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Current: {getDurationLabel(duration[0])}
                {!isPaidUser && (
                  <span className="ml-2 text-orange-500">
                    • Upgrade to paid plan for up to 3 min songs
                  </span>
                )}
              </p>
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
              className={
                tags.trim().length === 0 && description.trim().length > 5
                  ? "border-red-500"
                  : ""
              }
              data-testid="song-tags-input"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {tags.trim().length === 0 && description.trim().length > 5 ? (
                <span className="text-red-500">Tags are required</span>
              ) : (
                "Separate tags with commas"
              )}
            </p>

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
                  disabled={
                    !description.trim() || generateLyricsMutation.isPending
                  }
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
                className={`resize-none ${!lyricsValidation.isValid ? "border-red-500" : ""}`}
                data-testid="lyrics-textarea"
              />
              {/* Lyrics word count and validation feedback */}
              {lyrics.trim().length > 0 && (
                <div className={`mt-2 text-xs ${lyricsValidation.isValid ? "text-muted-foreground" : "text-red-500"}`}>
                  {lyricsValidation.wordCount} words 
                  {!lyricsValidation.isValid && (
                    <span> (max {lyricsValidation.maxWordsAllowed} for this duration)</span>
                  )}
                </div>
              )}
              {/* Lyrics too long warning */}
              {!lyricsValidation.isValid && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                        Lyrics too long for selected duration
                      </p>
                      <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                        {lyricsValidation.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {songTitle && (
                <div className="mt-3 p-3 bg-primary/10 rounded-md">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-music text-primary"></i>
                    <span className="text-sm font-semibold text-muted-foreground">
                      Generated Title:
                    </span>
                    <span className="font-bold text-primary">{songTitle}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Song Title */}
          <div>
            <Label className="flex items-center text-sm font-semibold mb-2">
              <i className="fas fa-music text-primary mr-2"></i>
              Song Title
            </Label>
            <Input
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              placeholder="Enter song title or it will be generated with lyrics..."
              className="w-full"
              data-testid="song-title-input"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This will be auto-populated when you generate lyrics with AI
            </p>
          </div>

          {/* Captions Toggle */}
          <div>
            <Label className="flex items-center text-sm font-semibold mb-2">
              <Subtitles className="w-4 h-4 text-accent mr-2" />
              Captions
            </Label>
            <div className="flex items-center space-x-2">
              <Switch
                checked={addSubtitles}
                onCheckedChange={setAddSubtitles}
                data-testid="subtitles-toggle"
              />
              <Label className="text-sm text-muted-foreground">
                Generate timed lyrics for your music video using ElevenLabs
              </Label>
            </div>
          </div>

          {/* Watermark Toggle */}
          <div>
            <Label className="flex items-center text-sm font-semibold mb-2">
              <i className="fas fa-copyright text-accent mr-2"></i>
              Watermark
            </Label>
            <div className="flex items-center space-x-2">
              <Switch
                checked={includeWatermark}
                onCheckedChange={setIncludeWatermark}
                data-testid="watermark-toggle"
                disabled={!isPremiumUser}
              />
              <Label className="text-sm text-muted-foreground">
                {isPremiumUser 
                  ? "Include watermark on your music video" 
                  : "Premium users can disable the watermark"}
              </Label>
            </div>
          </div>

          {/* Watermark Toggle */}
          <div>
            <Label className="flex items-center text-sm font-semibold mb-2">
              <i className="fas fa-copyright text-accent mr-2"></i>
              Watermark{" "}
              {isPremiumUser && (
                <span className="ml-2 text-xs text-primary">(Premium)</span>
              )}
            </Label>
            <div className="flex items-center space-x-2">
              <Switch
                checked={includeWatermark}
                onCheckedChange={setIncludeWatermark}
                data-testid="watermark-toggle"
                disabled={!isPremiumUser}
              />
              <Label className="text-sm text-muted-foreground">
                {isPremiumUser
                  ? "Include watermark on your music video"
                  : "Premium users can disable the watermark"}
              </Label>
            </div>
          </div>

          {/* Generation Progress */}
          {generateSongMutation.isPending && (
            <div
              className="bg-muted/30 rounded-lg p-4"
              data-testid="song-generation-progress"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold">Generating Song...</span>
                <div className="loading-spinner"></div>
              </div>
              <Progress value={progress} className="mb-2" />
              <p className="text-sm text-muted-foreground">
                {progress < 30
                  ? "Processing your request..."
                  : progress < 60
                    ? "Generating musical composition..."
                    : progress < 80
                      ? "Creating vocals..."
                      : progress < 100
                        ? "Mixing and mastering..."
                        : "Song generation complete!"}
              </p>
            </div>
          )}
        </div>

        {/* Requirements indicator */}
        {(description.trim().length > 0 || tags.trim().length > 0) &&
          !canGenerate && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-md p-3 mt-4">
              <p className="text-sm text-orange-600 dark:text-orange-400">
                <i className="fas fa-info-circle mr-2"></i>
                To generate a song, you need:
                <span className="block mt-1 ml-6">
                  {description.trim().length < 5 && (
                    <span className="block">
                      • At least 5 characters in description (currently:{" "}
                      {description.trim().length})
                    </span>
                  )}
                  {tags.trim().length === 0 && (
                    <span className="block">• At least one tag</span>
                  )}
                  {!lyricsValidation.isValid && (
                    <span className="block">• Shorten lyrics or increase duration</span>
                  )}
                </span>
              </p>
            </div>
          )}

        <div className="flex justify-end space-x-3 mt-6">
          <Button
            variant="secondary"
            onClick={handleClose}
            data-testid="cancel-song-generation"
          >
            Cancel
          </Button>
          <Button
            onClick={() => generateSongMutation.mutate()}
            disabled={!canGenerate || generateSongMutation.isPending}
            className="floating-button"
            data-testid="generate-song-button"
            title={
              !canGenerate
                ? "Please enter at least 5 characters in description and add at least one tag"
                : "Generate your AI song"
            }
          >
            <i className="fas fa-magic mr-2"></i>
            Generate Song (Free)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
