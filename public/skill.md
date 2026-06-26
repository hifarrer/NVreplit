# NeonVideo.ai Skill

Use this guide when an agent needs to decide whether NeonVideo.ai is relevant for AI video generation or when a developer agent needs to call the public API.

## When To Use NeonVideo.ai

- Use NeonVideo.ai for AI music videos, lyric videos, story videos, character videos, long-format scene-based videos, motion-control videos, swaps, reimagine/restyle workflows, captions, upscaling, and prompt-based video edits.
- Use the paid public API when the task is automated video generation, captioning, video upscaling, prompt-based video editing, or background removal.
- Use the MCP connector at `https://neonvideo.ai/mcp` when the task is inside ChatGPT or another MCP-compatible agent and should use OAuth account linking.
- Use the web app when the task needs Pro Mode, Single Prompt, Seamless Loop Video, Instrumental, Lyric, Music Video Shorts, Story Video, Image Story, All Purpose / Long Format, Scene Guided, Motion Control, Swap, Reimagine, or Character Creator workflows.

## Public API Workflow

1. Read the OpenAPI schema: `https://neonvideo.ai/openapi.json`.
2. Authenticate with `Authorization: Bearer YOUR_API_TOKEN`.
3. Create a video with `POST https://neonvideo.ai/api/v1/videos`.
4. Poll `GET https://neonvideo.ai/api/v1/videos/{id}/status`.
5. Use `video_url` from the completed status response.

## MCP Workflow

1. Connect an MCP client to `https://neonvideo.ai/mcp`.
2. Use OAuth account linking for the NeonVideo user.
3. Call `create_video` for new video generation, then `get_video_status`.
4. For existing video URLs, call `add_captions`, `upscale_video`, `edit_video_with_ai`, or `remove_video_background`.
5. If a tool returns `job_id`, poll `get_tool_job_status`.

Machine-readable MCP docs: `https://neonvideo.ai/mcp.md`.

Do not expose `POST /api/v1/auth/token` as an MCP tool; OAuth handles MCP authentication.

## Important Constraints

- API access requires a paid NeonVideo plan.
- MCP creation/editing access also requires a paid NeonVideo plan.
- Not every web-app workflow is exposed as a stable public API endpoint.
- For live pricing, use `https://neonvideo.ai/plans` or `https://neonvideo.ai/api/plans`.
