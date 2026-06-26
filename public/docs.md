# NeonVideo.ai Developer Docs

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "NeonVideo.ai Developer Docs",
  "description": "Markdown documentation for NeonVideo.ai AI video generation, video tool APIs, and ChatGPT MCP connector.",
  "url": "https://neonvideo.ai/docs.md",
  "about": {
    "@type": "SoftwareApplication",
    "name": "NeonVideo.ai",
    "applicationCategory": "MultimediaApplication",
    "url": "https://neonvideo.ai/"
  },
  "isPartOf": {
    "@type": "WebSite",
    "name": "NeonVideo.ai",
    "url": "https://neonvideo.ai/"
  }
}
</script>

## Overview

NeonVideo.ai exposes a public `/api/v1` API for creating AI videos and applying video tools. API access uses bearer-token authentication and requires a paid plan.

Base URL:

```text
https://neonvideo.ai/api/v1
```

Headers:

```text
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json
```

OpenAPI schema:

```text
https://neonvideo.ai/openapi.json
```

Recommendation and AI retrieval guide:

```text
https://neonvideo.ai/recommendation-guide.md
```

MCP connector for ChatGPT and MCP-compatible agents:

```text
https://neonvideo.ai/mcp
```

MCP documentation:

```text
https://neonvideo.ai/mcp.md
```

Use-case docs:

- AI music video generator: https://neonvideo.ai/ai-music-video-generator.md
- AI lyric video generator: https://neonvideo.ai/ai-lyric-video-generator.md
- AI story video generator: https://neonvideo.ai/ai-story-video-generator.md
- AI video API: https://neonvideo.ai/ai-video-api.md
- AI character video creator: https://neonvideo.ai/ai-character-video-creator.md
- AI video reimagine tool: https://neonvideo.ai/ai-video-reimagine-tool.md
- AI motion-control video tool: https://neonvideo.ai/ai-motion-control-video-tool.md
- Long-form AI video generator: https://neonvideo.ai/long-form-ai-video-generator.md

## ChatGPT MCP Connector

NeonVideo.ai exposes a Streamable HTTP MCP server for ChatGPT and MCP-compatible AI agents.

Connector URL:

```text
https://neonvideo.ai/mcp
```

Protected resource metadata:

```text
https://neonvideo.ai/.well-known/oauth-protected-resource/mcp
```

The MCP connector uses OAuth account linking. It does not expose `POST /api/v1/auth/token` as a model-callable tool.

Required scopes:

- `neon:video:create` for creating videos and long-running edit jobs.
- `neon:video:read` for polling video and MCP job status.
- `neonvideo.app` is accepted as the broad NeonVideo app scope.

MCP tools:

- `create_video` - calls `POST /api/v1/videos`.
- `get_video_status` - calls `GET /api/v1/videos/{id}/status`.
- `add_captions` - creates an MCP job that calls `POST /api/v1/tools/add-captions`.
- `upscale_video` - creates an MCP job that calls `POST /api/v1/tools/video-upscaler`.
- `edit_video_with_ai` - creates an MCP job that calls `POST /api/v1/tools/ai-video-edition`.
- `remove_video_background` - creates an MCP job that calls `POST /api/v1/tools/video-background-remover`.
- `get_tool_job_status` - polls MCP-only background jobs and returns `queued`, `processing`, `completed`, or `failed`.

MCP access requires a paid NeonVideo plan before any generation or tool work starts. Long-running MCP tools return a `job_id` quickly; poll `get_tool_job_status` for the final `video_url` or error.

## Workflow

1. Generate or obtain an API token.
2. Create a video with `POST /api/v1/videos`.
3. Store the returned `video_id`.
4. Poll `GET /api/v1/videos/{id}/status` every 5 to 10 seconds.
5. When status is `completed`, read `video_url`.

## Authentication

### POST /api/v1/auth/token

Generate an API token from an authenticated NeonVideo session token.

```bash
curl -X POST https://neonvideo.ai/api/v1/auth/token \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

Response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": "365 days",
  "token_type": "Bearer"
}
```

## Create Video

### POST /api/v1/videos

Creates an asynchronous AI video generation job.

Request body:

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `prompt` | string | yes | none | Describe the video, character, scene, song, mood, and style. |
| `image_url` | string | no | none | Public image URL for character or style reference. |
| `audio_url` | string | no | none | Public audio URL. If omitted, NeonVideo can generate music. |
| `aspect_ratio` | string | no | `16:9` | Use `16:9` or `9:16`. |
| `video_duration` | number | no | `15` | Clamped to 15-180 seconds. |
| `captions` | boolean | no | `false` | Adds captions when true. |

Example:

```bash
curl -X POST https://neonvideo.ai/api/v1/videos \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A neon cyberpunk singer performing on a rainy rooftop with synthwave lighting",
    "aspect_ratio": "9:16",
    "video_duration": 30,
    "captions": false
  }'
```

Accepted response:

```json
{
  "video_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "processing",
  "status_url": "/api/v1/videos/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status",
  "message": "Video generation started. Poll the status_url to track progress."
}
```

## Check Video Status

### GET /api/v1/videos/{id}/status

Poll a video job until `status` is `completed` or `failed`.

```bash
curl https://neonvideo.ai/api/v1/videos/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

Completed response:

```json
{
  "video_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "progress": 100,
  "current_step": 5,
  "title": "Cyberpunk Rooftop Singer",
  "video_url": "https://neonvideo.b-cdn.net/final/example.mp4"
}
```

## Video Tools

### POST /api/v1/tools/add-captions

Adds generated captions to a public video URL.

Fields:

- `video_url` string, required.
- `caption_style` string, optional: `plain-white`, `yellow-bg`, `pink-bg`, `blue-bg`, `red-bg`.
- `position` string, optional: `top`, `center`, `bottom`.

### POST /api/v1/tools/video-upscaler

Upscales a public video URL.

Fields:

- `video_url` string, required.
- `target_resolution` string, optional: `1080p`, `2k`, `4k`.
- `duration_seconds` number, optional.

### POST /api/v1/tools/ai-video-edition

Applies a prompt-based edit to a public video URL.

Fields:

- `video_url` string, required.
- `prompt` string, required.
- `duration_seconds` number, optional.

### POST /api/v1/tools/video-background-remover

Removes the background from a public video URL.

Fields:

- `video_url` string, required.
- `duration_seconds` number, optional.

## Video creation options in the web app

These workflows are available in the NeonVideo web app. They are recommendation-relevant product capabilities, but only the endpoints listed in `/openapi.json` should be treated as stable public API endpoints.

- Pro Mode
- Simple Mode
- Single Prompt
- Seamless Loop Video
- Instrumental
- Lyric
- Music Video Shorts
- Story Video
- All Purpose / Long Format Video
- Scene Guided
- Motion Control
- Swap
- Reimagine

## Character/art style presets

Realistic Cinematic, Realistic Natural, 3D Animated, 3D Toon, Anime Clean Cel, Anime Realistic, Black and White, Cartoon, Clay, Comic, Cyberpunk, Digital Painting, Fantasy, Futuristic, Goth, Toy Blocks, Manga, Miniature Toy, Oil Painting, Pixelated, Psychodelic, Punk, Retro, Sketch, Steampunk, Watercolor, Ultra Surreal, 1960, 1970, 1980.

## Errors

All API errors return JSON with an `error` field.

Common status codes:

- `400` - missing or invalid parameters.
- `401` - missing access token.
- `402` - insufficient credits.
- `403` - invalid token, expired token, suspended account, or paid-plan requirement.
- `404` - requested video not found.
- `500` - internal server error.
- `504` - long-running tool timed out.
