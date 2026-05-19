#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    args[key] = value;
    if (value !== "true") {
      i += 1;
    }
  }
  return args;
}

const defaults = {
  claude: path.join(homedir(), ".claude", "mcp.json"),
  cursor: path.join(homedir(), ".cursor", "mcp.json"),
  codex: path.join(homedir(), ".codex", "mcp.json"),
  antigravity: path.join(homedir(), ".antigravity", "mcp.json")
};

function ensureJson(filePath) {
  if (!existsSync(filePath)) {
    return { mcpServers: {} };
  }
  const raw = readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return { mcpServers: {} };
  }
  const parsed = JSON.parse(raw);
  if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
    parsed.mcpServers = {};
  }
  return parsed;
}

function usageAndExit(error) {
  if (error) {
    process.stderr.write(`${error}\n\n`);
  }
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/install-mcp.mjs --platform <claude|cursor|codex|antigravity> [--config /path/to/mcp.json]",
      "  node scripts/install-mcp.mjs --platform claude",
      "  node scripts/install-mcp.mjs --platform cursor --config ./.cursor/mcp.json"
    ].join("\n")
  );
  process.exit(error ? 1 : 0);
}

const args = parseArgs(process.argv);
if (args.help === "true") {
  usageAndExit();
}

const platform = String(args.platform ?? "").toLowerCase();
if (!platform || !(platform in defaults)) {
  usageAndExit("Missing or invalid --platform.");
}

const repoRoot = process.cwd();
const serverEntry = {
  command: "node",
  args: [path.join(repoRoot, "dist", "main.js")]
};

const configPath = args.config ? path.resolve(String(args.config)) : defaults[platform];
const configDir = path.dirname(configPath);
if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
}

const config = ensureJson(configPath);
config.mcpServers["code-digger"] = serverEntry;
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

process.stdout.write(
  [
    `Installed code-digger MCP for ${platform}.`,
    `Config: ${configPath}`,
    `Command: node ${serverEntry.args[0]}`,
    "",
    "Next:",
    "1) Restart your IDE/agent runtime.",
    "2) Run ingest_repo with your repository root."
  ].join("\n")
);
