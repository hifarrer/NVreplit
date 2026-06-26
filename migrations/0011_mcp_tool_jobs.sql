CREATE TABLE IF NOT EXISTS "mcp_tool_jobs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "tool_name" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "request_payload" jsonb NOT NULL,
  "result_payload" jsonb,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "started_at" timestamp,
  "completed_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mcp_tool_jobs_user_created_idx" ON "mcp_tool_jobs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "mcp_tool_jobs_status_idx" ON "mcp_tool_jobs" ("status");
