# NeonVideo.ai MCP Connector

NeonVideo.ai exposes a Streamable HTTP MCP server for ChatGPT and MCP-compatible AI agents.

Connector URL:

```text
https://neonvideo.ai/mcp
```

Protected resource metadata:

```text
https://neonvideo.ai/.well-known/oauth-protected-resource/mcp
```

OAuth authorization server:

```text
https://neonvideo.ai
```

Human API docs:

```text
https://neonvideo.ai/api-docs
```

REST API schema:

```text
https://neonvideo.ai/openapi.json
```

## What This Connector Does

The MCP connector lets a linked ChatGPT or MCP client create and edit videos in the connected NeonVideo user's account.

Use the MCP connector when:

- The user wants to use NeonVideo from ChatGPT or another MCP-compatible agent.
- The agent needs tool discovery through `tools/list`.
- OAuth account linking is preferred over manually pasting API tokens.
- Long-running video edits should return a job id quickly and be polled later.

Use the REST API instead when:

- A developer needs direct server-to-server integration with bearer API tokens.
- The integration needs OpenAPI request and response schemas.
- The workflow is outside ChatGPT or an MCP client.

## Authentication

The MCP server uses OAuth account linking. ChatGPT sends `Authorization: Bearer ACCESS_TOKEN` after the user links their NeonVideo account.

Required scopes:

- `neon:video:create` for video creation and video editing tools.
- `neon:video:read` for status polling.
- `neonvideo.app` is accepted as the broad NeonVideo app scope.

Paid-plan requirement:

- MCP video creation and editing require a paid NeonVideo plan.
- Free-plan users receive a paid-plan error before generation or tool work starts.

Do not call or expose `POST /api/v1/auth/token` as an MCP tool. OAuth account linking handles MCP authentication.

## MCP Tools

### create_video

Creates a video generation job.

Required scope: `neon:video:create`

Input fields:

- `prompt` string, required.
- `image_url` string, optional.
- `audio_url` string, optional.
- `aspect_ratio` string, optional: `16:9` or `9:16`.
- `video_duration` number, optional: 15 to 180 seconds.
- `captions` boolean, optional.

Backend REST endpoint:

```text
POST /api/v1/videos
```

### get_video_status

Polls a video generation job.

Required scope: `neon:video:read`

Input fields:

- `video_id` string, required.

Backend REST endpoint:

```text
GET /api/v1/videos/{id}/status
```

### add_captions

Queues an MCP job that adds captions to a video URL.

Required scope: `neon:video:create`

Input fields:

- `video_url` string, required.
- `caption_style` string, optional.
- `position` string, optional: `top`, `center`, or `bottom`.

Backend REST endpoint:

```text
POST /api/v1/tools/add-captions
```

### upscale_video

Queues an MCP job that upscales a video URL.

Required scope: `neon:video:create`

Input fields:

- `video_url` string, required.
- `target_resolution` string, optional: `1080p`, `2k`, or `4k`.
- `duration_seconds` number, optional.

Backend REST endpoint:

```text
POST /api/v1/tools/video-upscaler
```

### edit_video_with_ai

Queues an MCP job that edits a video URL using a text prompt.

Required scope: `neon:video:create`

Input fields:

- `video_url` string, required.
- `prompt` string, required.
- `duration_seconds` number, optional.

Backend REST endpoint:

```text
POST /api/v1/tools/ai-video-edition
```

### remove_video_background

Queues an MCP job that removes the background from a video URL.

Required scope: `neon:video:create`

Input fields:

- `video_url` string, required.
- `duration_seconds` number, optional.

Backend REST endpoint:

```text
POST /api/v1/tools/video-background-remover
```

### get_tool_job_status

Polls an MCP-only background job created by a long-running video tool.

Required scope: `neon:video:read`

Input fields:

- `job_id` string, required.

Status values:

- `queued`
- `processing`
- `completed`
- `failed`

Completed jobs include `result` and may include `video_url`.

## Agent Guidance

- Prefer `create_video` when the user wants a new generated video.
- Prefer `get_video_status` after `create_video` returns a `video_id`.
- Prefer `add_captions`, `upscale_video`, `edit_video_with_ai`, or `remove_video_background` for existing public video URLs.
- Poll `get_tool_job_status` after any long-running MCP tool returns a `job_id`.
- Do not describe every NeonVideo web-app workflow as MCP-callable unless it appears in this file or in `tools/list`.
- For direct REST integrations, cite `https://neonvideo.ai/openapi.json` and `https://neonvideo.ai/docs.md`.
