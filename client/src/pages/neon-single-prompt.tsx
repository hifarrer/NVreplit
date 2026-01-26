import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Music, Video, Monitor, Smartphone, Palette } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

export default function NeonSinglePrompt() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("9:16");
  const [style, setStyle] = useState<string>("3d");
  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);

  // Fetch project details if we have a generated project
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", generatedProjectId],
    enabled: !!generatedProjectId,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { prompt: string; aspectRatio: string; style: string }) => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/neon-single-prompt", {
        method: "POST",
        body: JSON.stringify({ 
          prompt: data.prompt,
          aspectRatio: data.aspectRatio,
          style: data.style
        }),
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const error = await response.json();
        throw error;
      }
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Video Generation Started!",
        description: data.message,
      });
      setGeneratedProjectId(data.projectId);
    },
    onError: (error: any) => {
      if (error.missing) {
        toast({
          title: "Incomplete Prompt",
          description: error.suggestion,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to generate video",
          variant: "destructive",
        });
      }
    },
  });

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        title: "Empty Prompt",
        description: "Please enter a prompt describing your music video",
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({ prompt, aspectRatio, style });
  };

  const examplePrompts = [
    {
      text: "A hyper realistic cyberpunk woman with neon blue hair singing 'Midnight City' in the rainy streets of Tokyo at night",
      style: "hyperrealistic",
      aspectRatio: "9:16" as const,
    },
    {
      text: "Create a cartoon music video about a cute little cowboy hamster singing 'Cowboy's Life' about adventures in the wild west desert",
      style: "cartoon",
      aspectRatio: "16:9" as const,
    },
    {
      text: "An anime magical girl with pink hair performing 'Starlight Dreams' while flying through a neon-lit futuristic city",
      style: "anime",
      aspectRatio: "9:16" as const,
    },
    {
      text: "A realistic jazz musician in a smoky 1920s speakeasy playing 'Midnight Blues' on saxophone",
      style: "realistic",
      aspectRatio: "16:9" as const,
    },
    {
      text: "A 3D animated astronaut panda floating in zero gravity performing 'Space Disco' inside a colorful space station",
      style: "3d",
      aspectRatio: "16:9" as const,
    },
    {
      text: "A hyper realistic rock singer with long hair performing 'Thunder Road' on stage with dramatic lighting and pyrotechnics",
      style: "hyperrealistic",
      aspectRatio: "16:9" as const,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            <Sparkles className="inline-block mr-2 h-8 w-8" />
            NeonSinglePrompt
          </h1>
          <p className="text-gray-300">
            Create a complete AI music video from a single prompt
          </p>
        </div>

        <Card className="bg-gray-800/50 border-purple-500/30 mb-8">
          <CardHeader>
            <CardTitle className="text-white">Describe Your Music Video</CardTitle>
            <CardDescription className="text-gray-400">
              Include a character description, song title, and video description. You can also choose the video orientation and character style below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Example: Create a music video about a cute little cowboy hamster singing a song called 'Cowboy's Life' about adventures in the wild west."
              className="min-h-[120px] bg-gray-900/50 border-purple-500/30 text-white placeholder:text-gray-500"
              data-testid="input-prompt"
            />

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label className="text-gray-300 flex items-center gap-2">
                  {aspectRatio === "16:9" ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                  Aspect Ratio
                </Label>
                <Select value={aspectRatio} onValueChange={(value: "16:9" | "9:16") => setAspectRatio(value)}>
                  <SelectTrigger className="bg-gray-900/50 border-purple-500/30 text-white">
                    <SelectValue placeholder="Select aspect ratio" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-purple-500/30">
                    <SelectItem value="16:9" className="text-white hover:bg-purple-600/20">
                      <span className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        Horizontal (16:9)
                      </span>
                    </SelectItem>
                    <SelectItem value="9:16" className="text-white hover:bg-purple-600/20">
                      <span className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4" />
                        Vertical (9:16)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300 flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Character Style
                </Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger className="bg-gray-900/50 border-purple-500/30 text-white">
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-purple-500/30">
                    <SelectItem value="3d" className="text-white hover:bg-purple-600/20">3D Animation</SelectItem>
                    <SelectItem value="cartoon" className="text-white hover:bg-purple-600/20">Cartoon</SelectItem>
                    <SelectItem value="anime" className="text-white hover:bg-purple-600/20">Anime</SelectItem>
                    <SelectItem value="realistic" className="text-white hover:bg-purple-600/20">Realistic</SelectItem>
                    <SelectItem value="hyperrealistic" className="text-white hover:bg-purple-600/20">Hyper Realistic</SelectItem>
                    <SelectItem value="artistic" className="text-white hover:bg-purple-600/20">Artistic</SelectItem>
                    <SelectItem value="radiant" className="text-white hover:bg-purple-600/20">Radiant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="mt-4 space-y-2">
              <p className="text-sm text-gray-400">Example prompts (click to use):</p>
              {examplePrompts.map((example, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPrompt(example.text);
                    setStyle(example.style);
                    setAspectRatio(example.aspectRatio);
                  }}
                  className="w-full text-left justify-start border-purple-500/30 text-gray-300 hover:bg-purple-600/20 h-auto py-2"
                  data-testid={`example-prompt-${index}`}
                >
                  <div className="flex flex-col items-start gap-1 w-full">
                    <span className="text-xs text-purple-400">
                      {example.aspectRatio === "9:16" ? "Vertical" : "Horizontal"} | {example.style.charAt(0).toUpperCase() + example.style.slice(1)}
                    </span>
                    <span className="text-gray-300 text-left whitespace-normal">{example.text}</span>
                  </div>
                </Button>
              ))}
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              className="w-full mt-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              data-testid="button-generate"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Music className="mr-2 h-4 w-4" />
                  Generate Music Video
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {generatedProjectId && (
          <Card className="bg-gray-800/50 border-green-500/30">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Video className="mr-2 h-5 w-5" />
                Video Generation Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              {project ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-gray-300">
                      <span className="font-semibold">Title:</span> {project.title}
                    </p>
                    <p className="text-gray-300">
                      <span className="font-semibold">Status:</span>{" "}
                      {project.isCompleted ? (
                        <span className="text-green-400">✓ Completed</span>
                      ) : (
                        <span className="text-yellow-400">⏳ Processing (Step {project.currentStep}/7)</span>
                      )}
                    </p>
                  </div>

                  {project.isCompleted && project.finalVideoUrl && (
                    <div className="space-y-2">
                      <p className="text-green-400 font-semibold">Your video is ready!</p>
                      <video
                        controls
                        className="w-full rounded-lg"
                        src={project.finalVideoUrl}
                        data-testid="video-player"
                      >
                        Your browser does not support the video tag.
                      </video>
                      <Button
                        onClick={() => project.finalVideoUrl && window.open(project.finalVideoUrl, "_blank")}
                        className="w-full bg-green-600 hover:bg-green-700"
                        data-testid="button-download"
                      >
                        Download Video
                      </Button>
                    </div>
                  )}

                  {!project.isCompleted && (
                    <div className="flex items-center text-gray-400">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating your music video... This may take a few minutes.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center text-gray-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading project details...
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mt-8 p-4 bg-gray-800/30 rounded-lg border border-purple-500/20">
          <h3 className="text-lg font-semibold text-purple-400 mb-2">How it works:</h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>AI analyzes your prompt to extract character, song title, and video description</li>
            <li>Generates creative lyrics for your song</li>
            <li>Creates a 30-second AI-generated song with the lyrics</li>
            <li>Generates a character image based on your description</li>
            <li>Creates 4 scene images for your music video</li>
            <li>Merges everything into a complete music video</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
