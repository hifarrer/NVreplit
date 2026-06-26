import type { Request } from "express";
import type { IncomingHttpHeaders } from "http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest, RequestInfo } from "@modelcontextprotocol/sdk/types.js";
import type { Plan, User } from "@shared/schema";
import { storage } from "../storage";

export const MCP_SCOPES = ["neonvideo.app", "neon:video:create", "neon:video:read"] as const;
export type McpScope = typeof MCP_SCOPES[number];

export type McpAuthContext = {
  token: string;
  userId: string;
  clientId: string;
  scopes: string[];
  expiresAt: Date;
  userWithPlan: User & { plan?: Plan };
  isPaidPlan: boolean;
};

type HeaderMap = IncomingHttpHeaders | RequestInfo["headers"] | Headers | Record<string, unknown>;

export class McpAuthChallengeError extends Error {
  readonly errorCode: string;
  readonly errorDescription: string;
  readonly requiredScopes: string[];

  constructor(message: string, errorCode: string, errorDescription: string, requiredScopes: string[] = []) {
    super(message);
    this.name = "McpAuthChallengeError";
    this.errorCode = errorCode;
    this.errorDescription = errorDescription;
    this.requiredScopes = requiredScopes;
  }
}

export class McpPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpPolicyError";
  }
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function getHeader(headers: HeaderMap | undefined, name: string): string | undefined {
  if (!headers) return undefined;

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const lowerName = name.toLowerCase();
  const value = (headers as Record<string, unknown>)[lowerName] ?? (headers as Record<string, unknown>)[name];
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function getProtocolFromHeaders(headers: HeaderMap | undefined): string | undefined {
  const forwardedProto = getHeader(headers, "x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim();
  }
  return undefined;
}

function isExpressRequest(value: unknown): value is Request {
  return Boolean(value && typeof value === "object" && typeof (value as Request).get === "function");
}

function isRequestInfo(value: unknown): value is RequestInfo {
  return Boolean(value && typeof value === "object" && !isExpressRequest(value) && "headers" in value);
}

export function getPublicBaseUrl(req?: Request): string {
  if (process.env.BASE_URL) return trimTrailingSlash(process.env.BASE_URL);
  if (process.env.API_URL) return trimTrailingSlash(process.env.API_URL);

  if (req) {
    const protocol = getProtocolFromHeaders(req.headers) || req.protocol || (req.secure ? "https" : "http");
    const host = req.get("host") || req.headers.host;
    if (host) {
      return trimTrailingSlash(`${protocol}://${host}`);
    }
  }

  if (process.env.FRONTEND_URL) return trimTrailingSlash(process.env.FRONTEND_URL);

  const port = process.env.PORT || "5000";
  return `http://localhost:${port}`;
}

export function getPublicBaseUrlFromRequestInfo(requestInfo?: RequestInfo): string {
  if (process.env.BASE_URL) return trimTrailingSlash(process.env.BASE_URL);
  if (process.env.API_URL) return trimTrailingSlash(process.env.API_URL);

  if (requestInfo?.url) {
    return trimTrailingSlash(requestInfo.url.origin);
  }

  const host = getHeader(requestInfo?.headers, "host");
  if (host) {
    const protocol = getProtocolFromHeaders(requestInfo?.headers) || "http";
    return trimTrailingSlash(`${protocol}://${host}`);
  }

  if (process.env.FRONTEND_URL) return trimTrailingSlash(process.env.FRONTEND_URL);

  const port = process.env.PORT || "5000";
  return `http://localhost:${port}`;
}

export function getMcpResourceUrl(baseUrlOrReq?: string | Request | RequestInfo): string {
  const baseUrl = typeof baseUrlOrReq === "string"
    ? trimTrailingSlash(baseUrlOrReq)
    : isRequestInfo(baseUrlOrReq)
      ? getPublicBaseUrlFromRequestInfo(baseUrlOrReq as RequestInfo)
      : getPublicBaseUrl(baseUrlOrReq as Request | undefined);
  return `${baseUrl}/mcp`;
}

export function getMcpResourceMetadataUrl(baseUrlOrReq?: string | Request | RequestInfo): string {
  const baseUrl = typeof baseUrlOrReq === "string"
    ? trimTrailingSlash(baseUrlOrReq)
    : isRequestInfo(baseUrlOrReq)
      ? getPublicBaseUrlFromRequestInfo(baseUrlOrReq as RequestInfo)
      : getPublicBaseUrl(baseUrlOrReq as Request | undefined);
  return `${baseUrl}/.well-known/oauth-protected-resource/mcp`;
}

function escapeAuthParam(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildWwwAuthenticate(
  baseUrlOrReq?: string | Request | RequestInfo,
  options: { error?: string; errorDescription?: string; scopes?: string[] } = {},
): string {
  const params = [
    `resource_metadata="${escapeAuthParam(getMcpResourceMetadataUrl(baseUrlOrReq))}"`,
  ];
  if (options.scopes?.length) {
    params.push(`scope="${escapeAuthParam(options.scopes.join(" "))}"`);
  }
  if (options.error) {
    params.push(`error="${escapeAuthParam(options.error)}"`);
  }
  if (options.errorDescription) {
    params.push(`error_description="${escapeAuthParam(options.errorDescription)}"`);
  }
  return `Bearer ${params.join(", ")}`;
}

export function getBearerTokenFromHeaders(headers: HeaderMap | undefined): string | null {
  const authHeader = getHeader(headers, "authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function resolveMcpAuthFromHeaders(headers: HeaderMap | undefined): Promise<McpAuthContext | null> {
  const token = getBearerTokenFromHeaders(headers);
  if (!token) {
    return null;
  }

  const oauthToken = await storage.getOauthAccessToken(token);
  if (!oauthToken || new Date() > oauthToken.expiresAt) {
    await storage.deleteExpiredOauthTokens().catch((error) => {
      console.error("[MCP] Error deleting expired OAuth tokens:", error);
    });
    return null;
  }

  const user = await storage.getUser(oauthToken.userId);
  if (!user) {
    return null;
  }

  const isBanned = await storage.isEmailBanned(user.email);
  if (isBanned) {
    throw new McpPolicyError("This NeonVideo account has been suspended.");
  }

  const userWithPlan = await storage.getUserWithPlan(oauthToken.userId);
  if (!userWithPlan) {
    return null;
  }

  return {
    token,
    userId: oauthToken.userId,
    clientId: oauthToken.clientId,
    scopes: oauthToken.scopes,
    expiresAt: oauthToken.expiresAt,
    userWithPlan,
    isPaidPlan: Boolean(userWithPlan.plan && (userWithPlan.plan.monthlyPrice ?? 0) > 0),
  };
}

export function toMcpAuthInfo(authContext: McpAuthContext, req: Request): AuthInfo {
  return {
    token: authContext.token,
    clientId: authContext.clientId,
    scopes: authContext.scopes,
    expiresAt: Math.floor(authContext.expiresAt.getTime() / 1000),
    resource: new URL(getMcpResourceUrl(req)),
    extra: {
      mcpAuthContext: authContext,
    },
  };
}

function getAuthContextFromExtra(extra: RequestHandlerExtra<ServerRequest, ServerNotification>): McpAuthContext | undefined {
  return extra.authInfo?.extra?.mcpAuthContext as McpAuthContext | undefined;
}

function hasRequiredScopes(grantedScopes: string[], requiredScopes: string[]): boolean {
  if (grantedScopes.includes("neonvideo.app")) {
    return true;
  }
  return requiredScopes.every((scope) => grantedScopes.includes(scope));
}

export async function requireMcpAuth(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  requiredScopes: string[],
): Promise<McpAuthContext> {
  let authContext = getAuthContextFromExtra(extra);
  if (!authContext && extra.requestInfo?.headers) {
    authContext = await resolveMcpAuthFromHeaders(extra.requestInfo.headers) ?? undefined;
  }

  if (!authContext) {
    throw new McpAuthChallengeError(
      "Authentication required.",
      "invalid_token",
      "Connect your NeonVideo account to continue.",
      requiredScopes,
    );
  }

  if (!hasRequiredScopes(authContext.scopes, requiredScopes)) {
    throw new McpAuthChallengeError(
      "Insufficient OAuth scope.",
      "insufficient_scope",
      `This tool requires: ${requiredScopes.join(" ")}.`,
      requiredScopes,
    );
  }

  if (!authContext.isPaidPlan) {
    throw new McpPolicyError("NeonVideo MCP access requires a paid plan. Upgrade at https://neonvideo.ai/plans.");
  }

  return authContext;
}
