import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Upload, Link, ImageIcon, Loader2, Sparkles, Download, Bookmark } from "lucide-react";

const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1 (Square)" },
  { value: "16:9", label: "16:9 (Landscape)" },
  { value: "9:16", label: "9:16 (Portrait)" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
] as const;

interface SavedCharacter {
  id: string;
  name: string;
  prompt: string;
  imageUrl: string;
  createdAt: string;
}

export default function CreateAiImageEditPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sourceTab, setSourceTab] = useState<"upload" | "url" | "gallery">("gallery");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [urlInput, setUrlInput] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: characters = [], isLoading: charactersLoading } = useQuery<SavedCharacter[]>({
    queryKey: ["/api/characters"],
    enabled: sourceTab === "gallery",
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      const response = await apiRequest("POST", "/api/ai-image-edit/upload", formData);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      const data = await response.json();
      return data.imageUrl as string;
    },
    onSuccess: (url) => {
      setImageUrl(url);
      toast({ title: "Image uploaded", description: "You can now describe your edit and generate." });
    },
    onError: (e) => {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Failed to upload image",
        variant: "destructive",
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai-image-edit", {
        imageUrl,
        prompt: prompt.trim(),
        aspectRatio,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Generation failed");
      }
      const data = await response.json();
      return data.imageUrl as string;
    },
    onSuccess: (url) => {
      setResultUrl(url);
      toast({ title: "Edit complete", description: "Your image has been generated." });
    },
    onError: (e) => {
      toast({
        title: "Generation failed",
        description: e instanceof Error ? e.message : "AI image edit failed",
        variant: "destructive",
      });
    },
  });

  const saveToLibraryMutation = useMutation({
    mutationFn: async () => {
      if (!resultUrl) throw new Error("No image to save");
      const response = await apiRequest("POST", "/api/characters", {
        imageUrl: resultUrl,
        name: "AI Image Edit",
        prompt: prompt.trim() || "Edited with AI Image Edit",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to save");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Saved to library", description: "Image saved to your characters library." });
    },
    onError: (e) => {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Could not save to library",
        variant: "destructive",
      });
    },
  });

  const handleDownload = async () => {
    if (!resultUrl) return;
    setIsDownloading(true);
    try {
      const urlToFetch = resultUrl.startsWith("http") ? resultUrl : `${window.location.origin}${resultUrl.startsWith("/") ? "" : "/"}${resultUrl}`;
      const res = await fetch(urlToFetch, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch image");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `ai-image-edit-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      toast({ title: "Download started", description: "Your image is downloading." });
    } catch (e) {
      toast({
        title: "Download failed",
        description: e instanceof Error ? e.message : "Could not download image",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Invalid file", description: "Please select an image (JPEG, PNG, GIF, WebP).", variant: "destructive" });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: "File too large", description: "Image must be under 10MB.", variant: "destructive" });
        return;
      }
      uploadMutation.mutate(file);
    }
    e.target.value = "";
  };

  const handleUseUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      toast({ title: "Enter a URL", description: "Paste an image URL and click Use URL.", variant: "destructive" });
      return;
    }
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      toast({ title: "Invalid URL", description: "URL must start with http:// or https://", variant: "destructive" });
      return;
    }
    setImageUrl(trimmed);
    toast({ title: "URL set", description: "You can now describe your edit and generate." });
  };

  const handleSelectFromGallery = (character: SavedCharacter) => {
    setImageUrl(character.imageUrl);
    toast({ title: "Image selected", description: `Using "${character.name}". Describe your edit and generate.` });
  };

  const canGenerate = imageUrl && prompt.trim().length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationHeader currentPage="home" />

      <main className="flex-1 container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            className="mb-6 -ml-2"
            onClick={() => navigate("/create")}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Create
          </Button>

          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-pink-500" />
              AI Image Edit
            </h1>
            <p className="text-muted-foreground mt-1">
              Edit any image with a prompt using AI. Upload an image, paste a URL, or pick one from your gallery.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Source image</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as typeof sourceTab)}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="gallery" className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      Gallery
                    </TabsTrigger>
                    <TabsTrigger value="upload" className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload
                    </TabsTrigger>
                    <TabsTrigger value="url" className="flex items-center gap-2">
                      <Link className="h-4 w-4" />
                      URL
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="gallery" className="mt-4">
                    {charactersLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : characters.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No saved characters. Create one in Character Creator or use Upload / URL.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                        {characters.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={`relative aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                              imageUrl === c.imageUrl ? "border-pink-500" : "border-transparent hover:border-muted"
                            }`}
                            onClick={() => handleSelectFromGallery(c)}
                          >
                            <img
                              src={c.imageUrl}
                              alt={c.name}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="upload" className="mt-4">
                    <div className="border border-dashed rounded-lg p-6 text-center">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadMutation.isPending}
                      >
                        {uploadMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Choose image (max 10MB)
                      </Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="url" className="mt-4 space-y-2">
                    <Input
                      placeholder="https://example.com/image.jpg"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                    />
                    <Button variant="secondary" size="sm" onClick={handleUseUrl}>
                      Use URL
                    </Button>
                  </TabsContent>
                </Tabs>

                {imageUrl && (
                  <div className="pt-2">
                    <Label className="text-muted-foreground text-xs">Current image</Label>
                    <div className="mt-1 rounded-lg overflow-hidden border bg-muted aspect-video max-h-40">
                      <img
                        src={imageUrl}
                        alt="Source"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Edit settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prompt">Describe what you want</Label>
                  <Textarea
                    id="prompt"
                    placeholder="e.g. Make the background a sunset beach, add a hat, change to watercolor style..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Aspect ratio</Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select ratio" />
                    </SelectTrigger>
                    <SelectContent>
                      {ASPECT_RATIOS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  disabled={!canGenerate || generateMutation.isPending}
                  onClick={() => generateMutation.mutate()}
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate edited image
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {resultUrl && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="text-lg">Result</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={resultUrl}
                    alt="Edited result"
                    className="w-full max-h-[70vh] object-contain"
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={handleDownload}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => saveToLibraryMutation.mutate()}
                    disabled={saveToLibraryMutation.isPending}
                  >
                    {saveToLibraryMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Bookmark className="h-4 w-4 mr-2" />
                    )}
                    Save to library
                  </Button>
                  <Button variant="secondary" onClick={() => { setResultUrl(null); setImageUrl(""); setPrompt(""); }}>
                    New edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
