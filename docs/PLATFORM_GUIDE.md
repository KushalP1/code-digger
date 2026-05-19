# Platform Guide

This document shows how to run Code Digger MCP in Claude Code, Cursor, Codex, and Antigravity.

---

## 1) Build once

From repo root:

```bash
npm install
npm run build
```

Prerequisite for deep Python intelligence:

- `python3` installed and available on `PATH` (for AST extraction)

The MCP command used by all platforms:

```bash
node /absolute/path/to/code-digger/dist/main.js
```

---

## 2) Claude Code

One-command install:

```bash
npm run install:claude
```

Add an MCP server entry in your Claude Code MCP config (typically `~/.claude/mcp.json` or your workspace-level MCP config):

```json
{
  "mcpServers": {
    "code-digger": {
      "command": "node",
      "args": [
        "/absolute/path/to/code-digger/dist/main.js"
      ]
    }
  }
}
```

Restart Claude Code, then run:

1. `ingest_repo` with your repository root
2. `summarize_scope`
3. `ask_codebase`

---

## 3) Cursor

One-command install:

```bash
npm run install:cursor
```

In Cursor settings, add MCP server configuration for the workspace or user profile:

```json
{
  "mcpServers": {
    "code-digger": {
      "command": "node",
      "args": [
        "/absolute/path/to/code-digger/dist/main.js"
      ]
    }
  }
}
```

Then in chat:

- Ingest: "Run `ingest_repo` for this repo."
- Ask architecture questions directly.
- Use `trace_feature` before implementing new features.

---

## 4) Codex

One-command install:

```bash
npm run install:codex
```

For Codex environments that support MCP server registration, add:

```json
{
  "mcpServers": {
    "code-digger": {
      "command": "node",
      "args": [
        "/absolute/path/to/code-digger/dist/main.js"
      ]
    }
  }
}
```

If your Codex runtime uses a different MCP config file name, keep the same server block and place it in that runtime's MCP settings file.

Recommended first workflow:

1. `ingest_repo`
2. `learning_path` for your role
3. `impact_analysis` before edits

---

## 5) Antigravity

One-command install:

```bash
npm run install:antigravity
```

For Antigravity setups with MCP-compatible plugin registration, register the same stdio server command:

```json
{
  "mcpServers": {
    "code-digger": {
      "command": "node",
      "args": [
        "/absolute/path/to/code-digger/dist/main.js"
      ]
    }
  }
}
```

If Antigravity expects TOML/YAML, map these fields directly:

- `command`: `node`
- `args[0]`: absolute path to `dist/main.js`
- server name: `code-digger`

---

## Custom config path

If your platform stores MCP config in a non-default location:

```bash
npm run install:mcp -- --platform <claude|cursor|codex|antigravity> --config /absolute/path/to/mcp.json
```

---

## 6) Daily usage pattern (all platforms)

Use this exact sequence for giant codebases:

1. `ingest_repo` once per major code update
2. `summarize_scope` to orient domains
3. `ask_codebase` for "why/how/where" questions
4. `trace_feature` for end-to-end system understanding
5. `impact_analysis` before changing shared files
6. `learning_path` for onboarding and handovers

---

## 7) Example prompts engineers can ask

- "How does login flow from frontend to session store?"
- "Where is payment retry logic and timeout policy?"
- "Which modules affect subscription cancellation?"
- "What breaks if we remove this cache abstraction?"
- "Give me an architect-level onboarding path for this monorepo."
