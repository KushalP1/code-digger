#!/usr/bin/env node
import { startServer } from "./server.js";

startServer().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[code-digger-mcp] fatal: ${message}\n`);
  process.exit(1);
});
