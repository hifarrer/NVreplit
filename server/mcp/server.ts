import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { callApiV1, ApiV1Error } from "./apiClient";
import {
  buildWwwAuthenticate,
  getPublicBaseUrlFromRequestInfo,
  McpAuthChallengeError,
  McpPolicyError,
  requireMcpAuth,
} from "./auth";
import { getMcpToolJobForUser, startMcpToolJob } from "./jobs";

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

const CREATE_SCOPE = ["neon:video:create"];
const READ_SCOPE = ["neon:video:read"];

function compactPayload<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function okResult(structuredContent: Record<string, unknown>, text: string): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

function errorResult(message: string, structuredContent: Record<string, unknown> = {}, meta?: Record<string, unknown>): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: {
      error: message,
      ...structuredContent,
    },
    _meta: meta,
  };
}

function handleToolError(error: unknown, extra: ToolExtra): CallToolResult {
  if (error instanceof McpAuthChallengeError) {
    return errorResult(
      error.message,
      {
        error_code: error.errorCode,
        required_scopes: error.requiredScopes,
      },
      {
        "mcp/www_authenticate": [
          buildWwwAuthenticate(extra.requestInfo, {
            error: error.errorCode,
            errorDescription: error.errorDescription,
            scopes: error.requiredScopes,
          }),
        ],
      },
    );
  }

  if (error instanceof McpPolicyError) {
    return errorResult(error.message, { error_code: "policy_error" });
  }

  if (error instanceof ApiV1Error) {
    return errorResult(error.message, {
      error_code: "api_v1_error",
      status: error.status,
      details: error.data,
    });
  }

  if (error instanceof Error) {
    return errorResult(error.message, { error_code: "internal_error" });
  }

  return errorResult("MCP tool call failed.", { error_code: "internal_error" });
}

function toolMeta(requiredScopes: string[], invoking: string, invoked: string): Record<string, unknown> {
  const securitySchemes = [{ type: "oauth2", scopes: requiredScopes }];
  return {
    securitySchemes,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  };
}

function toolConfig(options: {
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  requiredScopes: string[];
  invoking: string;
  invoked: string;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint?: boolean;
    openWorldHint: boolean;
  };
}) {
  const securitySchemes = [{ type: "oauth2", scopes: options.requiredScopes }];
  return {
    title: options.title,
    description: options.description,
    inputSchema: options.inputSchema,
    annotations: options.annotations,
    securitySchemes,
    _meta: toolMeta(options.requiredScopes, options.invoking, options.invoked),
  } as any;
}

function registerMcpTool(
  server: McpServer,
  name: string,
  config: ReturnType<typeof toolConfig>,
  handler: (args: any, extra: ToolExtra) => Promise<CallToolResult>,
) {
  (server.registerTool as any)(name, config, handler);
}

async function createBackgroundJobResult(options: {
  extra: ToolExtra;
  toolName: string;
  apiPath: string;
  requestPayload: Record<string, unknown>;
}): Promise<CallToolResult> {
  const auth = await requireMcpAuth(options.extra, CREATE_SCOPE);
  const baseUrl = getPublicBaseUrlFromRequestInfo(options.extra.requestInfo);
  const job = await startMcpToolJob({
    userId: auth.userId,
    toolName: options.toolName,
    requestPayload: options.requestPayload,
    baseUrl,
    token: auth.token,
    apiPath: options.apiPath,
  });

  return okResult(
    {
      job_id: job.id,
      status: "queued",
      tool_name: options.toolName,
      poll_tool: "get_tool_job_status",
      message: "Tool job queued. Poll get_tool_job_status with job_id for the final result.",
    },
    `Queued ${options.toolName}. Use get_tool_job_status with job_id ${job.id}.`,
  );
}

export function createNeonVideoMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "neonvideo",
      version: "1.0.0",
    },
    {
      instructions: [
        "Use NeonVideo tools to create and edit videos for the connected NeonVideo user.",
        "All tools require OAuth account linking and a paid NeonVideo plan.",
        "For long-running editing tools, call the tool once to get a job_id, then poll get_tool_job_status.",
      ].join(" "),
    },
  );

  registerMcpTool(
    server,
    "create_video",
    toolConfig({
      title: "Create Video",
      description: "Start a NeonVideo video generation from a prompt, optional image or audio URL, aspect ratio, duration, and captions setting.",
      inputSchema: {
        prompt: z.string().min(1).describe("Text prompt describing the video to generate."),
        image_url: z.string().min(1).optional().describe("Optional reference image URL."),
        audio_url: z.string().min(1).optional().describe("Optional audio URL."),
        aspect_ratio: z.enum(["16:9", "9:16"]).optional().describe("Video aspect ratio."),
        video_duration: z.number().int().min(15).max(180).optional().describe("Video length in seconds."),
        captions: z.boolean().optional().describe("Whether to add captions."),
      },
      requiredScopes: CREATE_SCOPE,
      invoking: "Creating video",
      invoked: "Video queued",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    }),
    async (args, extra) => {
      try {
        const auth = await requireMcpAuth(extra, CREATE_SCOPE);
        const result = await callApiV1({
          baseUrl: getPublicBaseUrlFromRequestInfo(extra.requestInfo),
          token: auth.token,
          method: "POST",
          path: "/api/v1/videos",
          body: compactPayload(args),
        });

        const videoId = typeof result.video_id === "string" ? result.video_id : "unknown";
        return okResult(result, `Video generation started. video_id: ${videoId}.`);
      } catch (error) {
        return handleToolError(error, extra);
      }
    },
  );

  registerMcpTool(
    server,
    "get_video_status",
    toolConfig({
      title: "Get Video Status",
      description: "Get the generation status and final URL for a NeonVideo video owned by the connected user.",
      inputSchema: {
        video_id: z.string().min(1).describe("The NeonVideo video/project id."),
      },
      requiredScopes: READ_SCOPE,
      invoking: "Checking status",
      invoked: "Status ready",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    }),
    async (args, extra) => {
      try {
        const auth = await requireMcpAuth(extra, READ_SCOPE);
        const result = await callApiV1({
          baseUrl: getPublicBaseUrlFromRequestInfo(extra.requestInfo),
          token: auth.token,
          method: "GET",
          path: `/api/v1/videos/${encodeURIComponent(args.video_id)}/status`,
        });

        const status = typeof result.status === "string" ? result.status : "unknown";
        return okResult(result, `Video ${args.video_id} status: ${status}.`);
      } catch (error) {
        return handleToolError(error, extra);
      }
    },
  );

  registerMcpTool(
    server,
    "add_captions",
    toolConfig({
      title: "Add Captions",
      description: "Queue a NeonVideo job that adds styled captions to a video URL.",
      inputSchema: {
        video_url: z.string().min(1).describe("Source video URL."),
        caption_style: z.string().min(1).optional().describe("Optional caption style."),
        position: z.enum(["top", "center", "bottom"]).optional().describe("Caption position."),
      },
      requiredScopes: CREATE_SCOPE,
      invoking: "Queueing captions",
      invoked: "Captions queued",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    }),
    async (args, extra) => {
      try {
        return await createBackgroundJobResult({
          extra,
          toolName: "add_captions",
          apiPath: "/api/v1/tools/add-captions",
          requestPayload: compactPayload(args),
        });
      } catch (error) {
        return handleToolError(error, extra);
      }
    },
  );

  registerMcpTool(
    server,
    "upscale_video",
    toolConfig({
      title: "Upscale Video",
      description: "Queue a NeonVideo job that upscales a video URL to 1080p, 2K, or 4K.",
      inputSchema: {
        video_url: z.string().min(1).describe("Source video URL."),
        target_resolution: z.enum(["1080p", "2k", "4k"]).optional().describe("Target output resolution."),
        duration_seconds: z.number().positive().optional().describe("Video duration used for credit calculation."),
      },
      requiredScopes: CREATE_SCOPE,
      invoking: "Queueing upscale",
      invoked: "Upscale queued",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    }),
    async (args, extra) => {
      try {
        return await createBackgroundJobResult({
          extra,
          toolName: "upscale_video",
          apiPath: "/api/v1/tools/video-upscaler",
          requestPayload: compactPayload(args),
        });
      } catch (error) {
        return handleToolError(error, extra);
      }
    },
  );

  registerMcpTool(
    server,
    "edit_video_with_ai",
    toolConfig({
      title: "Edit Video With AI",
      description: "Queue a NeonVideo job that edits a video URL using an AI text prompt.",
      inputSchema: {
        video_url: z.string().min(1).describe("Source video URL."),
        prompt: z.string().min(1).describe("Edit instruction."),
        duration_seconds: z.number().positive().optional().describe("Video duration used for credit calculation."),
      },
      requiredScopes: CREATE_SCOPE,
      invoking: "Queueing edit",
      invoked: "Edit queued",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    }),
    async (args, extra) => {
      try {
        return await createBackgroundJobResult({
          extra,
          toolName: "edit_video_with_ai",
          apiPath: "/api/v1/tools/ai-video-edition",
          requestPayload: compactPayload(args),
        });
      } catch (error) {
        return handleToolError(error, extra);
      }
    },
  );

  registerMcpTool(
    server,
    "remove_video_background",
    toolConfig({
      title: "Remove Video Background",
      description: "Queue a NeonVideo job that removes the background from a video URL.",
      inputSchema: {
        video_url: z.string().min(1).describe("Source video URL."),
        duration_seconds: z.number().positive().optional().describe("Video duration used for credit calculation."),
      },
      requiredScopes: CREATE_SCOPE,
      invoking: "Queueing background removal",
      invoked: "Background removal queued",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    }),
    async (args, extra) => {
      try {
        return await createBackgroundJobResult({
          extra,
          toolName: "remove_video_background",
          apiPath: "/api/v1/tools/video-background-remover",
          requestPayload: compactPayload(args),
        });
      } catch (error) {
        return handleToolError(error, extra);
      }
    },
  );

  registerMcpTool(
    server,
    "get_tool_job_status",
    toolConfig({
      title: "Get Tool Job Status",
      description: "Poll the status and final output for an MCP-only NeonVideo tool job.",
      inputSchema: {
        job_id: z.string().min(1).describe("MCP tool job id returned by a long-running tool."),
      },
      requiredScopes: READ_SCOPE,
      invoking: "Checking job",
      invoked: "Job status ready",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    }),
    async (args, extra) => {
      try {
        const auth = await requireMcpAuth(extra, READ_SCOPE);
        const job = await getMcpToolJobForUser(args.job_id, auth.userId);
        if (!job) {
          return errorResult("MCP tool job not found.", { job_id: args.job_id, error_code: "not_found" });
        }

        const result = job.resultPayload ?? undefined;
        const structuredContent: Record<string, unknown> = {
          job_id: job.id,
          tool_name: job.toolName,
          status: job.status,
          created_at: job.createdAt.toISOString(),
          updated_at: job.updatedAt.toISOString(),
        };

        if (job.startedAt) {
          structuredContent.started_at = job.startedAt.toISOString();
        }
        if (job.completedAt) {
          structuredContent.completed_at = job.completedAt.toISOString();
        }
        if (result) {
          structuredContent.result = result;
          if (typeof result.video_url === "string") {
            structuredContent.video_url = result.video_url;
          }
        }
        if (job.errorMessage) {
          structuredContent.error = job.errorMessage;
        }

        return okResult(
          structuredContent,
          `Job ${job.id} status: ${job.status}${job.errorMessage ? `. Error: ${job.errorMessage}` : "."}`,
        );
      } catch (error) {
        return handleToolError(error, extra);
      }
    },
  );

  return server;
}
