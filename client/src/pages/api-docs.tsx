import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Code, Key, Video, Activity, ExternalLink, Subtitles, ArrowUpRight, Wand2, Eraser } from "lucide-react";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useAuth } from "@/hooks/use-auth";
import { Helmet } from "react-helmet-async";

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-zinc-950 text-zinc-100 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed border border-zinc-800">
      <code>{children}</code>
    </pre>
  );
}

function ParamRow({ name, type, required, defaultVal, description }: {
  name: string;
  type: string;
  required?: boolean;
  defaultVal?: string;
  description: string;
}) {
  return (
    <tr className="border-b border-border">
      <td className="py-3 pr-4 font-mono text-sm text-primary">{name}</td>
      <td className="py-3 pr-4 text-sm text-muted-foreground">{type}</td>
      <td className="py-3 pr-4 text-sm">
        {required ? (
          <Badge variant="destructive" className="text-xs">required</Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">optional</Badge>
        )}
      </td>
      <td className="py-3 pr-4 text-sm text-muted-foreground font-mono">{defaultVal || "—"}</td>
      <td className="py-3 text-sm">{description}</td>
    </tr>
  );
}

const apiDocsJsonLd = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "NeonVideo.ai API Documentation",
  description:
    "Developer documentation for the NeonVideo.ai public API and MCP connector, including AI video generation, captions, video upscaling, AI video editing, and background removal.",
  url: "https://neonvideo.ai/api-docs",
  mainEntityOfPage: "https://neonvideo.ai/api-docs",
  about: {
    "@type": "WebAPI",
    name: "NeonVideo.ai Public API",
    url: "https://neonvideo.ai/openapi.json",
    documentation: "https://neonvideo.ai/docs.md",
    potentialAction: {
      "@type": "InteractAction",
      target: "https://neonvideo.ai/mcp",
      name: "Connect NeonVideo.ai MCP server",
    },
  },
  isPartOf: {
    "@type": "WebSite",
    name: "NeonVideo.ai",
    url: "https://neonvideo.ai/",
  },
};

export default function ApiDocsPage() {
  const { user } = useAuth();
  const baseUrl = "https://neonvideo.ai";
  const isPaid = user?.plan && user?.plan?.name !== "Free";

  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(apiDocsJsonLd)}
        </script>
      </Helmet>
      <NavigationHeader />

      <main className="container mx-auto px-4 py-8 flex-1">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <Link href="/create">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to App
              </Button>
            </Link>
            <div className="flex items-center gap-3 mb-2">
              <Code className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold gradient-text">API Documentation</h1>
            </div>
            <p className="text-muted-foreground">
              Create AI-generated music videos programmatically using the NeonVideo API or connect NeonVideo to ChatGPT with MCP.
            </p>
            {!isPaid && (
              <div className="mt-4 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <p className="text-sm text-amber-400">
                  API access requires a paid plan.{" "}
                  <Link href="/plans?trial=1" className="underline font-medium">Start with our $1 Trial</Link> to get started.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-8">
            {/* Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The NeonVideo API lets you generate AI music videos from a text prompt. All video creation
                  requests are <strong>asynchronous</strong> — you submit a request and receive a video ID,
                  then poll a status endpoint until the video is ready.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 text-sm">
                  <div className="flex-1 p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium mb-1">Base URL</p>
                    <code className="text-primary">{baseUrl}/api/v1</code>
                  </div>
                  <div className="flex-1 p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium mb-1">Authentication</p>
                    <code className="text-primary">Bearer token</code>
                  </div>
                  <div className="flex-1 p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium mb-1">Content Type</p>
                    <code className="text-primary">application/json</code>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* MCP Connector */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  ChatGPT MCP Connector
                </CardTitle>
                <CardDescription>
                  Streamable HTTP MCP endpoint for ChatGPT and MCP-compatible agents
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  NeonVideo exposes an MCP server so ChatGPT and other MCP clients can discover NeonVideo tools,
                  link a user's account with OAuth, and create or edit videos without manually pasting API tokens.
                  The MCP server calls the same stable <code className="bg-muted px-1 rounded">/api/v1</code> backend used by this REST API.
                </p>

                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium mb-1">MCP Connector URL</p>
                    <code className="text-primary break-all">{baseUrl}/mcp</code>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium mb-1">OAuth Resource Metadata</p>
                    <code className="text-primary break-all">{baseUrl}/.well-known/oauth-protected-resource/mcp</code>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium mb-1">Machine-Readable MCP Docs</p>
                    <code className="text-primary break-all">{baseUrl}/mcp.md</code>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium mb-1">Auth Model</p>
                    <code className="text-primary">OAuth account linking</code>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium">Available MCP tools</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Tool</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Scope</th>
                          <th className="py-2 text-sm font-medium text-muted-foreground">Purpose</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4 font-mono text-sm text-primary">create_video</td>
                          <td className="py-3 pr-4 font-mono text-sm">neon:video:create</td>
                          <td className="py-3 text-sm">Start a video generation job.</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4 font-mono text-sm text-primary">get_video_status</td>
                          <td className="py-3 pr-4 font-mono text-sm">neon:video:read</td>
                          <td className="py-3 text-sm">Poll a generated video's status and final URL.</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4 font-mono text-sm text-primary">add_captions</td>
                          <td className="py-3 pr-4 font-mono text-sm">neon:video:create</td>
                          <td className="py-3 text-sm">Queue captions for an existing public video URL.</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4 font-mono text-sm text-primary">upscale_video</td>
                          <td className="py-3 pr-4 font-mono text-sm">neon:video:create</td>
                          <td className="py-3 text-sm">Queue video upscaling to 1080p, 2k, or 4k.</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4 font-mono text-sm text-primary">edit_video_with_ai</td>
                          <td className="py-3 pr-4 font-mono text-sm">neon:video:create</td>
                          <td className="py-3 text-sm">Queue a prompt-based edit for an existing video URL.</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4 font-mono text-sm text-primary">remove_video_background</td>
                          <td className="py-3 pr-4 font-mono text-sm">neon:video:create</td>
                          <td className="py-3 text-sm">Queue background removal for an existing video URL.</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4 font-mono text-sm text-primary">get_tool_job_status</td>
                          <td className="py-3 pr-4 font-mono text-sm">neon:video:read</td>
                          <td className="py-3 text-sm">Poll MCP-only background jobs returned by long-running tools.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <h4 className="font-medium">Agent guidance</h4>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                    <li>Use the connector URL when creating a ChatGPT connector: <code className="bg-muted px-1 rounded">{baseUrl}/mcp</code>.</li>
                    <li>Use OAuth account linking for MCP. Do not expose <code className="bg-muted px-1 rounded">POST /api/v1/auth/token</code> as an MCP tool.</li>
                    <li>Long-running MCP tools return a <code className="bg-muted px-1 rounded">job_id</code>; poll <code className="bg-muted px-1 rounded">get_tool_job_status</code> until the status is <code className="bg-muted px-1 rounded">completed</code> or <code className="bg-muted px-1 rounded">failed</code>.</li>
                    <li>Use the REST API and OpenAPI schema for direct server-to-server integrations.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Authentication */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Authentication
                </CardTitle>
                <CardDescription>
                  Generate an API token and use it with every request
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <h4 className="font-medium">Step 1: Get your API token</h4>
                  <p className="text-sm text-muted-foreground">
                    Go to your{" "}
                    <Link href="/profile" className="text-primary underline">Profile page</Link>{" "}
                    and click <strong>Generate API Token</strong> in the API Access section.
                    Alternatively, call the token endpoint with your existing session:
                  </p>
                  <CodeBlock>{`curl -X POST ${baseUrl}/api/v1/auth/token \\
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \\
  -H "Content-Type: application/json"`}</CodeBlock>
                  <p className="text-sm text-muted-foreground">Response:</p>
                  <CodeBlock>{`{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": "365 days",
  "token_type": "Bearer"
}`}</CodeBlock>
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <h4 className="font-medium">Step 2: Use the token</h4>
                  <p className="text-sm text-muted-foreground">
                    Include the token in the <code className="bg-muted px-1 rounded">Authorization</code> header
                    of every API request:
                  </p>
                  <CodeBlock>{`Authorization: Bearer YOUR_API_TOKEN`}</CodeBlock>
                </div>
              </CardContent>
            </Card>

            {/* Create Video */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  Create Video
                </CardTitle>
                <CardDescription>
                  <Badge className="mr-2">POST</Badge>
                  <code>/api/v1/videos</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Submit a prompt to generate an AI music video. The request is processed asynchronously —
                  you'll receive a <code className="bg-muted px-1 rounded">video_id</code> to poll for status.
                </p>

                {/* Parameters Table */}
                <div>
                  <h4 className="font-medium mb-3">Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Name</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Type</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Required</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Default</th>
                          <th className="py-2 text-sm font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <ParamRow
                          name="prompt"
                          type="string"
                          required
                          description="A description of the music video you want to create. Include character details, scene description, and mood."
                        />
                        <ParamRow
                          name="image_url"
                          type="string"
                          description="URL of a reference image to use for the character or visual style."
                        />
                        <ParamRow
                          name="audio_url"
                          type="string"
                          description="URL of an audio file to use as the song. If omitted, AI will generate a song."
                        />
                        <ParamRow
                          name="aspect_ratio"
                          type="string"
                          defaultVal='"16:9"'
                          description='Video aspect ratio. Accepted values: "16:9" (landscape) or "9:16" (portrait).'
                        />
                        <ParamRow
                          name="video_duration"
                          type="number"
                          defaultVal="15"
                          description="Duration of the video in seconds. Range: 15–180."
                        />
                        <ParamRow
                          name="captions"
                          type="boolean"
                          defaultVal="false"
                          description="Whether to add captions/subtitles to the video."
                        />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Example Request */}
                <div>
                  <h4 className="font-medium mb-3">Example Request</h4>
                  <CodeBlock>{`curl -X POST ${baseUrl}/api/v1/videos \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "A cute animated hamster cowboy riding through the desert at sunset, playing guitar and singing a country song",
    "aspect_ratio": "9:16",
    "video_duration": 30,
    "captions": false
  }'`}</CodeBlock>
                </div>

                {/* Example Response */}
                <div>
                  <h4 className="font-medium mb-3">Example Response <Badge variant="outline">202 Accepted</Badge></h4>
                  <CodeBlock>{`{
  "video_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "processing",
  "status_url": "/api/v1/videos/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status",
  "message": "Video generation started. Poll the status_url to track progress."
}`}</CodeBlock>
                </div>

                {/* With optional params */}
                <div>
                  <h4 className="font-medium mb-3">Example with Custom Audio and Image</h4>
                  <CodeBlock>{`curl -X POST ${baseUrl}/api/v1/videos \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "A dreamy synthwave music video with neon lights and a futuristic city skyline",
    "audio_url": "https://example.com/my-song.mp3",
    "image_url": "https://example.com/reference-character.png",
    "aspect_ratio": "16:9",
    "video_duration": 60,
    "captions": true
  }'`}</CodeBlock>
                </div>
              </CardContent>
            </Card>

            {/* Check Video Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Check Video Status
                </CardTitle>
                <CardDescription>
                  <Badge className="mr-2">GET</Badge>
                  <code>{"/api/v1/videos/:video_id/status"}</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Poll this endpoint to check the progress of your video generation.
                  We recommend polling every <strong>5–10 seconds</strong>.
                </p>

                {/* Example Request */}
                <div>
                  <h4 className="font-medium mb-3">Example Request</h4>
                  <CodeBlock>{`curl ${baseUrl}/api/v1/videos/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status \\
  -H "Authorization: Bearer YOUR_API_TOKEN"`}</CodeBlock>
                </div>

                {/* Processing Response */}
                <div>
                  <h4 className="font-medium mb-3">
                    Response — Processing <Badge variant="secondary">200</Badge>
                  </h4>
                  <CodeBlock>{`{
  "video_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "processing",
  "progress": 60,
  "current_step": 3,
  "title": "Desert Cowboy Hamster",
  "message": "Video is being generated..."
}`}</CodeBlock>
                </div>

                {/* Completed Response */}
                <div>
                  <h4 className="font-medium mb-3">
                    Response — Completed <Badge variant="secondary">200</Badge>
                  </h4>
                  <CodeBlock>{`{
  "video_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "progress": 100,
  "current_step": 5,
  "title": "Desert Cowboy Hamster",
  "video_url": "https://neonvideo.b-cdn.net/final/abc123.mp4",
  "bunny_storage_url": "https://neonvideo.b-cdn.net/final/abc123.mp4"
}`}</CodeBlock>
                </div>

                {/* Failed Response */}
                <div>
                  <h4 className="font-medium mb-3">
                    Response — Failed <Badge variant="secondary">200</Badge>
                  </h4>
                  <CodeBlock>{`{
  "video_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "failed",
  "progress": 0,
  "current_step": 3,
  "title": "Desert Cowboy Hamster",
  "message": "Video generation failed. Please try again."
}`}</CodeBlock>
                </div>

                {/* Status values */}
                <div>
                  <h4 className="font-medium mb-3">Status Values</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Status</th>
                          <th className="py-2 text-sm font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4"><code className="text-amber-400">processing</code></td>
                          <td className="py-3 text-sm">Video is being generated. Keep polling.</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4"><code className="text-green-400">completed</code></td>
                          <td className="py-3 text-sm">Video is ready. The <code className="bg-muted px-1 rounded">video_url</code> field contains the download link.</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4"><code className="text-red-400">failed</code></td>
                          <td className="py-3 text-sm">Video generation failed. You can retry by creating a new video.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Video Tools: Add Captions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Subtitles className="h-5 w-5" />
                  Add Captions
                </CardTitle>
                <CardDescription>
                  <Badge className="mr-2">POST</Badge>
                  <code>/api/v1/tools/add-captions</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Add TikTok-style captions to any video by providing a video URL. The service generates
                  captions from the audio and burns them into the video. The result is uploaded to storage
                  and the final video URL is returned (synchronous request).
                </p>

                <div>
                  <h4 className="font-medium mb-3">Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Name</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Type</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Required</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Default</th>
                          <th className="py-2 text-sm font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <ParamRow
                          name="video_url"
                          type="string"
                          required
                          description="Public URL of the video file (MP4, etc.) to add captions to."
                        />
                        <ParamRow
                          name="caption_style"
                          type="string"
                          defaultVal='"plain-white"'
                          description='Caption style: "plain-white", "yellow-bg", "pink-bg", "blue-bg", "red-bg".'
                        />
                        <ParamRow
                          name="position"
                          type="string"
                          defaultVal='"bottom"'
                          description='Caption position on the video: "top", "center", or "bottom".'
                        />
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Example Request</h4>
                  <CodeBlock>{`curl -X POST ${baseUrl}/api/v1/tools/add-captions \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "video_url": "https://example.com/my-video.mp4",
    "caption_style": "yellow-bg",
    "position": "bottom"
  }'`}</CodeBlock>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Example Response <Badge variant="secondary">200</Badge></h4>
                  <CodeBlock>{`{
  "video_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "video_url": "https://neonvideo.b-cdn.net/.../neonvideo_1234567890_captioned.mp4",
  "bunny_storage_url": "https://neonvideo.b-cdn.net/.../neonvideo_1234567890_captioned.mp4"
}`}</CodeBlock>
                  <p className="text-xs text-muted-foreground mt-2">
                    <code>bunny_storage_url</code> is present when the result is stored on Bunny CDN; otherwise only <code>video_url</code> is returned.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Video Tools: Video Upscaler */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpRight className="h-5 w-5" />
                  Video Upscaler
                </CardTitle>
                <CardDescription>
                  <Badge className="mr-2">POST</Badge>
                  <code>/api/v1/tools/video-upscaler</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Upscale a video to 1080p, 2K, or 4K using AI. Provide a video URL and target resolution.
                  Credits are charged based on video duration (per 15 seconds) and resolution. The request
                  is synchronous but may take several minutes while the upscale job runs.
                </p>

                <div>
                  <h4 className="font-medium mb-3">Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Name</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Type</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Required</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Default</th>
                          <th className="py-2 text-sm font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <ParamRow
                          name="video_url"
                          type="string"
                          required
                          description="Public URL of the video file to upscale."
                        />
                        <ParamRow
                          name="target_resolution"
                          type="string"
                          defaultVal='"1080p"'
                          description='Target resolution: "1080p", "2k", or "4k".'
                        />
                        <ParamRow
                          name="duration_seconds"
                          type="number"
                          defaultVal="15"
                          description="Duration of the video in seconds (used for credit calculation). If omitted, 15 is assumed. Pass the actual duration for accurate billing."
                        />
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Credits (Video Upscaler)</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Charged per 15 seconds of video, rounded up. Rate depends on target resolution:
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Resolution</th>
                          <th className="py-2 text-sm font-medium text-muted-foreground">Credits per 15s</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4 font-mono text-sm">1080p</td>
                          <td className="py-3 text-sm">250</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4 font-mono text-sm">2k</td>
                          <td className="py-3 text-sm">500</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-3 pr-4 font-mono text-sm">4k</td>
                          <td className="py-3 text-sm">1,000</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Example Request</h4>
                  <CodeBlock>{`curl -X POST ${baseUrl}/api/v1/tools/video-upscaler \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "video_url": "https://example.com/my-video.mp4",
    "target_resolution": "1080p",
    "duration_seconds": 30
  }'`}</CodeBlock>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Example Response <Badge variant="secondary">200</Badge></h4>
                  <CodeBlock>{`{
  "video_url": "https://wavespeed-output.example.com/...",
  "target_resolution": "1080p",
  "credits_required": 500,
  "duration_seconds_used": 30
}`}</CodeBlock>
                </div>

                <p className="text-xs text-muted-foreground">
                  If the client does not send <code>duration_seconds</code>, 15 seconds is assumed for credit calculation.
                  Sending the actual video duration ensures accurate billing.
                </p>
              </CardContent>
            </Card>

            {/* Video Tools: AI Video Edition */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5" />
                  AI Video Edition
                </CardTitle>
                <CardDescription>
                  <Badge className="mr-2">POST</Badge>
                  <code>/api/v1/tools/ai-video-edition</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Apply AI-powered edits to a video using a text prompt (e.g. change a specific part of the scene).
                  Provide a video URL and a prompt describing the edit. Credits are charged at 500 per 15 seconds
                  of video. The request is synchronous but may take several minutes.
                </p>

                <div>
                  <h4 className="font-medium mb-3">Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Name</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Type</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Required</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Default</th>
                          <th className="py-2 text-sm font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <ParamRow
                          name="video_url"
                          type="string"
                          required
                          description="Public URL of the video file to edit."
                        />
                        <ParamRow
                          name="prompt"
                          type="string"
                          required
                          description="Text description of the edit to apply (e.g. what to change in the video)."
                        />
                        <ParamRow
                          name="duration_seconds"
                          type="number"
                          defaultVal="15"
                          description="Duration of the video in seconds (used for credit calculation). If omitted, 15 is assumed."
                        />
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Credits (AI Video Edition)</h4>
                  <p className="text-sm text-muted-foreground">
                    500 credits per 15 seconds of video, rounded up.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Example Request</h4>
                  <CodeBlock>{`curl -X POST ${baseUrl}/api/v1/tools/ai-video-edition \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "video_url": "https://example.com/my-video.mp4",
    "prompt": "Replace the sky with a sunset",
    "duration_seconds": 30
  }'`}</CodeBlock>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Example Response <Badge variant="secondary">200</Badge></h4>
                  <CodeBlock>{`{
  "video_url": "https://wavespeed-output.example.com/...",
  "credits_required": 1000,
  "duration_seconds_used": 30
}`}</CodeBlock>
                </div>
              </CardContent>
            </Card>

            {/* Video Tools: Video Background Remover */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eraser className="h-5 w-5" />
                  Video Background Remover
                </CardTitle>
                <CardDescription>
                  <Badge className="mr-2">POST</Badge>
                  <code>/api/v1/tools/video-background-remover</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Remove the background from a video using AI. Provide a video URL; the result is a video
                  with the background removed (transparent or replaced). Credits are charged at 250 per 15 seconds
                  of video. The request is synchronous but may take several minutes.
                </p>

                <div>
                  <h4 className="font-medium mb-3">Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Name</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Type</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Required</th>
                          <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Default</th>
                          <th className="py-2 text-sm font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <ParamRow
                          name="video_url"
                          type="string"
                          required
                          description="Public URL of the video file to remove the background from."
                        />
                        <ParamRow
                          name="duration_seconds"
                          type="number"
                          defaultVal="15"
                          description="Duration of the video in seconds (used for credit calculation). If omitted, 15 is assumed."
                        />
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Credits (Video Background Remover)</h4>
                  <p className="text-sm text-muted-foreground">
                    250 credits per 15 seconds of video, rounded up.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Example Request</h4>
                  <CodeBlock>{`curl -X POST ${baseUrl}/api/v1/tools/video-background-remover \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "video_url": "https://example.com/my-video.mp4",
    "duration_seconds": 30
  }'`}</CodeBlock>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Example Response <Badge variant="secondary">200</Badge></h4>
                  <CodeBlock>{`{
  "video_url": "https://wavespeed-output.example.com/...",
  "credits_required": 500,
  "duration_seconds_used": 30
}`}</CodeBlock>
                </div>
              </CardContent>
            </Card>

            {/* Credits & Rate Limits */}
            <Card>
              <CardHeader>
                <CardTitle>Credits & Limits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Each video generation costs credits based on the video duration. Credits are deducted
                  only after a video is successfully generated.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Duration</th>
                        <th className="py-2 text-sm font-medium text-muted-foreground">Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border">
                        <td className="py-3 pr-4 text-sm">15 seconds</td>
                        <td className="py-3 text-sm font-mono">1,000</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-3 pr-4 text-sm">30 seconds</td>
                        <td className="py-3 text-sm font-mono">2,000</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-3 pr-4 text-sm">60 seconds</td>
                        <td className="py-3 text-sm font-mono">4,000</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-3 pr-4 text-sm">120 seconds</td>
                        <td className="py-3 text-sm font-mono">8,000</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-3 pr-4 text-sm">180 seconds</td>
                        <td className="py-3 text-sm font-mono">12,000</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Formula: ceil(duration / 15) × 1,000 credits. Song generation is free.
                </p>
              </CardContent>
            </Card>

            {/* Error Codes */}
            <Card>
              <CardHeader>
                <CardTitle>Error Responses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  All errors return a JSON object with an <code className="bg-muted px-1 rounded">error</code> field.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-4 text-sm font-medium text-muted-foreground">Code</th>
                        <th className="py-2 text-sm font-medium text-muted-foreground">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border">
                        <td className="py-3 pr-4 font-mono text-sm">400</td>
                        <td className="py-3 text-sm">Bad request — missing or invalid parameters.</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-3 pr-4 font-mono text-sm">401</td>
                        <td className="py-3 text-sm">Unauthorized — missing or invalid API token.</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-3 pr-4 font-mono text-sm">403</td>
                        <td className="py-3 text-sm">Forbidden — free plan users or suspended accounts.</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-3 pr-4 font-mono text-sm">404</td>
                        <td className="py-3 text-sm">Not found — video ID does not exist.</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-3 pr-4 font-mono text-sm">500</td>
                        <td className="py-3 text-sm">Internal server error — please retry or contact support.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4 className="font-medium mb-2 text-sm">Example Error Response</h4>
                  <CodeBlock>{`{
  "error": "API access requires a paid plan. Please upgrade at https://neonvideo.ai/plans"
}`}</CodeBlock>
                </div>
              </CardContent>
            </Card>

            {/* Quick Start */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Start Example</CardTitle>
                <CardDescription>Full workflow: create a video and wait for completion</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CodeBlock>{`#!/bin/bash

API_TOKEN="YOUR_API_TOKEN"
BASE_URL="${baseUrl}"

# 1. Create a video
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/videos" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "An animated fox DJ mixing electronic music at a neon-lit nightclub",
    "aspect_ratio": "9:16",
    "video_duration": 30
  }')

VIDEO_ID=$(echo "$RESPONSE" | jq -r '.video_id')
echo "Video ID: $VIDEO_ID"

# 2. Poll for status until completed
while true; do
  STATUS_RESPONSE=$(curl -s "$BASE_URL/api/v1/videos/$VIDEO_ID/status" \\
    -H "Authorization: Bearer $API_TOKEN")

  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
  PROGRESS=$(echo "$STATUS_RESPONSE" | jq -r '.progress')
  echo "Status: $STATUS ($PROGRESS%)"

  if [ "$STATUS" = "completed" ]; then
    VIDEO_URL=$(echo "$STATUS_RESPONSE" | jq -r '.video_url')
    echo "Video ready: $VIDEO_URL"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Video generation failed."
    break
  fi

  sleep 10
done`}</CodeBlock>

                {isPaid && (
                  <div className="pt-4 border-t flex items-center gap-3">
                    <Link href="/profile">
                      <Button>
                        <Key className="h-4 w-4 mr-2" />
                        Generate API Token
                      </Button>
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      Get your token from the Profile page to start using the API.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
