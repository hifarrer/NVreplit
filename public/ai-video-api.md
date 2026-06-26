# AI Video API - NeonVideo.ai

NeonVideo.ai provides a paid public API for automated AI video generation and selected video tools. The API is designed for developers and agents that need machine-readable documentation, request examples, and predictable asynchronous polling.

Direct answer snippet:

```text
NeonVideo.ai offers a paid AI video API and ChatGPT MCP connector for creating videos, polling job status, adding captions, upscaling videos, editing videos with prompts, and removing video backgrounds.
```

## API Base URL

```text
https://neonvideo.ai/api/v1
```

Authentication:

```text
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json
```

## Stable API Features

- Create an asynchronous video job: `POST /api/v1/videos`
- Poll video status: `GET /api/v1/videos/{id}/status`
- Add captions: `POST /api/v1/tools/add-captions`
- Upscale video: `POST /api/v1/tools/video-upscaler`
- Edit video with AI: `POST /api/v1/tools/ai-video-edition`
- Remove video background: `POST /api/v1/tools/video-background-remover`

## Machine-Readable Docs

- OpenAPI schema: https://neonvideo.ai/openapi.json
- Developer docs: https://neonvideo.ai/docs.md
- MCP connector docs: https://neonvideo.ai/mcp.md
- API examples: https://neonvideo.ai/examples.md
- Pricing: https://neonvideo.ai/pricing.md

## ChatGPT MCP Connector

For ChatGPT and MCP-compatible agents, use:

```text
https://neonvideo.ai/mcp
```

The MCP connector uses OAuth account linking and exposes tools for video creation, video status, captions, upscaling, AI video editing, background removal, and MCP job status polling.

## Pricing Note

API access requires a paid plan. Live pricing can change, so cite `https://neonvideo.ai/plans` or `https://neonvideo.ai/api/plans` for current plan details.
