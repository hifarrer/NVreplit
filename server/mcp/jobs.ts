import type { McpToolJob } from "@shared/schema";
import { storage } from "../storage";
import { ApiV1Error, callApiV1 } from "./apiClient";

export type McpJobStatus = "queued" | "processing" | "completed" | "failed";

const STALE_JOB_MS = 45 * 60 * 1000;

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : { value };
}

function extractErrorPayload(error: unknown): { message: string; resultPayload: Record<string, unknown> | null } {
  if (error instanceof ApiV1Error) {
    return {
      message: error.message,
      resultPayload: toRecord(error.data),
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      resultPayload: null,
    };
  }
  return {
    message: "MCP tool job failed",
    resultPayload: { error },
  };
}

async function runMcpToolJob(options: {
  jobId: string;
  baseUrl: string;
  token: string;
  apiPath: string;
  requestPayload: Record<string, unknown>;
}) {
  await storage.updateMcpToolJob(options.jobId, {
    status: "processing",
    startedAt: new Date(),
  });

  try {
    const result = await callApiV1({
      baseUrl: options.baseUrl,
      token: options.token,
      method: "POST",
      path: options.apiPath,
      body: options.requestPayload,
    });

    await storage.updateMcpToolJob(options.jobId, {
      status: "completed",
      resultPayload: result,
      errorMessage: null,
      completedAt: new Date(),
    });
  } catch (error) {
    const { message, resultPayload } = extractErrorPayload(error);
    await storage.updateMcpToolJob(options.jobId, {
      status: "failed",
      resultPayload,
      errorMessage: message,
      completedAt: new Date(),
    });
  }
}

export async function startMcpToolJob(options: {
  userId: string;
  toolName: string;
  requestPayload: Record<string, unknown>;
  baseUrl: string;
  token: string;
  apiPath: string;
}): Promise<McpToolJob> {
  const job = await storage.createMcpToolJob({
    userId: options.userId,
    toolName: options.toolName,
    status: "queued",
    requestPayload: options.requestPayload,
  });

  setImmediate(() => {
    void runMcpToolJob({
      jobId: job.id,
      baseUrl: options.baseUrl,
      token: options.token,
      apiPath: options.apiPath,
      requestPayload: options.requestPayload,
    }).catch((error) => {
      console.error("[MCP] Unhandled tool job error:", error);
    });
  });

  return job;
}

export async function getMcpToolJobForUser(jobId: string, userId: string): Promise<McpToolJob | undefined> {
  const job = await storage.getMcpToolJob(jobId);
  if (!job || job.userId !== userId) {
    return undefined;
  }

  const status = job.status as McpJobStatus;
  if ((status === "queued" || status === "processing") && Date.now() - job.updatedAt.getTime() > STALE_JOB_MS) {
    return await storage.updateMcpToolJob(job.id, {
      status: "failed",
      errorMessage: "MCP tool job did not finish before the timeout window. Please retry.",
      completedAt: new Date(),
    });
  }

  return job;
}
