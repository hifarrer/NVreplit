import { cpSync } from "fs";

try {
  cpSync("server/remotion", "dist/remotion", { recursive: true, force: true });
  console.log("✓ Copied server/remotion to dist/remotion");
} catch (error) {
  console.error("Error copying remotion directory:", error);
  process.exit(1);
}
