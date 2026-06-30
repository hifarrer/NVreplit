import type { Express, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  MCP_SCOPES,
  getMcpResourceUrl,
  getPublicBaseUrl,
  resolveMcpAuthFromHeaders,
  toMcpAuthInfo,
} from "./auth";
import { createNeonVideoMcpServer } from "./server";

const MCP_ALLOWED_METHODS = "GET, POST, DELETE, OPTIONS";
const MCP_ALLOWED_HEADERS = [
  "Accept",
  "Authorization",
  "Content-Type",
  "Last-Event-ID",
  "Mcp-Protocol-Version",
  "Mcp-Session-Id",
].join(", ");

function setMcpCorsHeaders(_req: Request, res: Response) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", MCP_ALLOWED_METHODS);
  res.header("Access-Control-Allow-Headers", MCP_ALLOWED_HEADERS);
  res.header("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

export function registerMcpRoutes(app: Express) {
  app.get("/.well-known/oauth-protected-resource/mcp", (req, res) => {
    setMcpCorsHeaders(req, res);
    const baseUrl = getPublicBaseUrl(req);
    res.json({
      resource: getMcpResourceUrl(baseUrl),
      authorization_servers: [baseUrl],
      scopes_supported: [...MCP_SCOPES],
      bearer_methods_supported: ["header"],
      resource_documentation: `${baseUrl}/mcp.md`,
    });
  });

  app.options("/mcp", (req, res) => {
    setMcpCorsHeaders(req, res);
    res.sendStatus(204);
  });

  app.all("/mcp", async (req, res) => {
    setMcpCorsHeaders(req, res);

    if (!["GET", "POST", "DELETE"].includes(req.method)) {
      res.header("Allow", MCP_ALLOWED_METHODS);
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const authContext = await resolveMcpAuthFromHeaders(req.headers);
      if (authContext) {
        (req as any).auth = toMcpAuthInfo(authContext, req);
      }
    } catch (error) {
      console.error("[MCP] Auth resolution failed:", error);
    }

    const server = createNeonVideoMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    transport.onerror = (error) => {
      console.error("[MCP] Transport error:", error);
    };

    try {
      await server.connect(transport);
      await transport.handleRequest(req as any, res, req.body);
    } catch (error) {
      console.error("[MCP] Request failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal MCP server error",
          },
          id: null,
        });
      }
    } finally {
      await server.close().catch((error) => {
        console.error("[MCP] Error closing server:", error);
      });
    }
  });
}
