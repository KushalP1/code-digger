# Code Digger MCP

Code Digger is an MCP server that turns large codebases into an architecture map you can query with natural language.

It is built for engineering teams that need faster onboarding, safer refactors, and lower cognitive load in fast-growing repositories.

## 30-second quickstart

```bash
npm install
npm run build
npm run install:cursor
```

Then restart your MCP client and run:

1. `ingest_repo` with your repository root path
2. `auto_understand_codebase` with low token settings
3. `architecture_diagram` for a high-level visual map

## Quick links

- [Quick copy: Orientation](#quick-copy-orientation)
- [Quick copy: Feature investigation](#quick-copy-feature-investigation)
- [Quick copy: Bug triage](#quick-copy-bug-triage)
- [Quick copy: Onboarding](#quick-copy-onboarding)
- [Quick copy: Refactor planning](#quick-copy-refactor-planning)
- [Quick copy: Performance investigation](#quick-copy-performance-investigation)
- [Quick copy: Python deep dive](#quick-copy-python-deep-dive)
- [Quick copy: Low-token mode](#quick-copy-low-token-mode)
- [Quick copy: PR architecture review](#quick-copy-pr-architecture-review)
- [Quick copy: PR architecture review (CI file list)](#quick-copy-pr-architecture-review-ci-file-list)
- [Quick copy: GitHub PR review](#quick-copy-github-pr-review)
- [Quick copy: Graph DB queries](#quick-copy-graph-db-queries)

### Quickstart options (choose one by goal)

If the 3-step sequence above feels too abstract, use this decision guide:

```mermaid
flowchart TD
  A[Start: repo connected] --> B[Run ingest_repo]
  B --> C{What do you need right now?}
  C -->|New to codebase| D[auto_understand_codebase + summarize_scope]
  C -->|Debug bug / incident| E[ask_codebase + trace_feature + impact_analysis]
  C -->|Plan refactor| F[trace_feature + impact_analysis]
  C -->|Onboard teammate| G[learning_path + summarize_scope]
  C -->|Python deep dive| H[python_symbol_insight + trace_feature]
  D --> I[architecture_diagram for visual map]
  E --> I
  F --> I
  G --> I
  H --> I
```

### Quickstart command packs (exhaustive practical variants)

#### Pack A: Fast orientation (default for any new repo)

1. `ingest_repo`
2. `summarize_scope` (no args)
3. `auto_understand_codebase` (`tokenBudget: 350`, `style: "compact"`)
4. `architecture_diagram` (`maxNodes: 10`)

What you get:

- High-level domain map
- Critical files by fan-in
- One diagram you can share in design/docs

#### Pack B: Low-token orientation

1. `ingest_repo`
2. `auto_understand_codebase` (`tokenBudget: 250`, `style: "caveman"`)
3. `architecture_diagram` (`maxNodes: 8`, `style: "caveman"`)

What you get:

- Minimal text volume
- Small architecture graph
- Faster responses in constrained contexts

#### Pack C: Feature understanding (recommended before edits)

1. `ask_codebase` with a feature question
2. `trace_feature` with same feature phrase
3. `impact_analysis` on target file before editing

What you get:

- Top relevant files
- Deterministic `canonicalFlow`
- Risk score + direct/transitive blast radius

#### Pack D: Bug triage / incident response

1. `ask_codebase` for symptom and failing behavior
2. `trace_feature` for affected user journey
3. `impact_analysis` on suspected hotspot files
4. `summarize_scope` on narrowed folder (optional)

What you get:

- Likely failure points
- Multi-hop dependency context
- Safer rollback/fix sequencing

#### Pack E: Onboarding by seniority

1. `summarize_scope`
2. `learning_path` (`beginner|senior|architect`)
3. `trace_feature` for one core journey

What you get:

- Read order
- Role-specific checklist
- Context-rich starter path

#### Pack F: Python architecture deep dive

1. Ensure `python3` works
2. `ingest_repo`
3. `python_symbol_insight` for service/class/function
4. `trace_feature` for runtime flow

What you get:

- Decorators + inheritance + async details
- Python call context
- Better symbol-level reasoning

## Why this exists

Large codebases fail teams in predictable ways:

- New engineers do not know where to start.
- Architecture intent is scattered across many files.
- Refactor blast radius is hard to estimate.
- Teams spend too much time re-learning the same system context.

Code Digger compresses that complexity into structured outputs: domain maps, dependency-aware answers, feature traces, and risk estimates.

## Core capabilities

- Hybrid lexical + embedding retrieval across the full repository
- Architecture/domain compression from file-level metadata
- Dependency + reverse dependency graph reasoning
- Feature path reconstruction (`trace_feature`)
- Blast-radius estimation (`impact_analysis`)
- Guided onboarding by role (`learning_path`)
- Python AST insights (decorators, inheritance, async, call graph)
- Auto-understanding mode for zero-question orientation
- Mermaid architecture diagram generation
- Persisted graph database backing for large repos (`graph_db_status`, `graph_db_neighbors`)
- Token-control options (`tokenBudget`, `maxNodes`, `style: caveman`)

## How it works

1. `ingest_repo` recursively indexes your codebase.
2. Indexing extracts symbols, imports, capability tags, token vectors, and local embedding vectors.
3. It builds dependency and reverse dependency graphs.
4. It persists a compact graph database snapshot to `.code-digger/graph-db.json`.
5. MCP tools answer architecture and implementation questions using that index or persisted graph DB.

---

## Exhaustive installation guide

### 1) Prerequisites

- Node.js `>=18` (Node 20+ recommended)
- npm
- Optional but recommended: `python3` on `PATH` (enables deep Python AST extraction)

Verify:

```bash
node --version
npm --version
python3 --version
```

### 2) Clone and install dependencies

```bash
git clone <your-repo-url>
cd code-digger
npm install
```

### 3) Build TypeScript output

```bash
npm run build
```

Expected server entrypoint after build:

- `dist/main.js`

### 4) Optional local quality checks

```bash
npm run lint
npm test
```

### 5) Install MCP config for your client

Run one of these from the repository root:

```bash
npm run install:claude
npm run install:cursor
npm run install:codex
npm run install:antigravity
```

Default config paths used by installer:

- Claude: `~/.claude/mcp.json`
- Cursor: `~/.cursor/mcp.json`
- Codex: `~/.codex/mcp.json`
- Antigravity: `~/.antigravity/mcp.json`

### 6) Custom config path (fully supported)

```bash
npm run install:mcp -- --platform cursor --config /absolute/path/to/mcp.json
```

Supported platform values:

- `claude`
- `cursor`
- `codex`
- `antigravity`

### 7) Restart your MCP client

Restart Claude/Cursor/Codex/Antigravity so it reloads MCP servers.

### 8) Verify server command

All installers register the server as stdio command:

```bash
node /absolute/path/to/code-digger/dist/main.js
```

Manual run for debugging:

```bash
node dist/main.js
```

### 9) Manual MCP JSON setup (if you do not use installer)

```json
{
  "mcpServers": {
    "code-digger": {
      "command": "node",
      "args": ["/absolute/path/to/code-digger/dist/main.js"]
    }
  }
}
```

Platform-specific manual notes are in `docs/PLATFORM_GUIDE.md`.

### 10) First-run initialization sequence

Run these tools in order:

1. `ingest_repo` (required once per repo snapshot)
2. `summarize_scope` (no args) for architecture baseline
3. `auto_understand_codebase` for compact briefing
4. `architecture_diagram` for dependency map
5. `trace_feature` for an important user flow
6. `impact_analysis` before modifying high-fanout files
7. `review_pr_impact` before final PR review
8. `graph_db_status` to verify persisted graph backing exists

---

## Complete tool reference (every tool + how to use)

Important: all tools except `ingest_repo` require a successful index in memory for the current server session.

### 1) `ingest_repo`

Builds or refreshes the repository index.

Input:

```json
{ "rootPath": "/absolute/path/to/repo" }
```

Usage notes:

- `rootPath` should be an absolute path.
- Re-run after major code changes.
- Required before any other tool in a fresh session.

### 2) `ask_codebase`

Answers natural-language implementation questions and returns relevant files with scores.

Input:

```json
{
  "question": "How does auth session invalidation work?",
  "topK": 8
}
```

Usage notes:

- `question` is required.
- `topK` is optional (default `8`).
- Uses hybrid ranking (TF-IDF lexical + local embeddings).
- Returns top files, file summaries, capability tags, and architecture context.

Best for:

- "Where is X implemented?"
- "How does Y flow through the system?"
- "Which files own this behavior?"

### 3) `summarize_scope`

Summarizes repository, folder, or file scope.

Input examples:

```json
{}
```

```json
{ "scopePath": "backend/auth" }
```

Usage notes:

- No `scopePath` gives repo-level overview.
- `scopePath` can be folder or file substring.
- Returns language breakdown, capabilities, and representative files.

### 4) `trace_feature`

Builds an end-to-end feature hypothesis from semantic relevance + dependency signals.

Input:

```json
{ "feature": "checkout retry and payment confirmation flow" }
```

Usage notes:

- `feature` is required and should be specific.
- Returns likely trace files with upstream/downstream links.
- Includes `canonicalFlow` for one deterministic "best narrative path" through the feature.
- Includes `priorityFlow` and `prioritizedBridgeFiles` for alternate supporting routes.
- Useful before changing cross-cutting behavior.

### 5) `impact_analysis`

Estimates blast radius of changing a file/module.

Input:

```json
{ "filePath": "src/services/billing.ts" }
```

Usage notes:

- `filePath` is required.
- Can be full path or suffix match.
- Returns direct dependencies, direct dependents, `riskScore`, and recommendation.

### 6) `learning_path`

Generates a role-specific onboarding/read-order plan.

Input:

```json
{ "role": "beginner" }
```

Allowed `role` values:

- `beginner`
- `senior`
- `architect`

Usage notes:

- Returns a step-by-step plan and suggested domains.
- Great for onboarding docs and handoffs.

### 7) `python_symbol_insight`

Performs deep Python symbol inspection from AST data.

Input:

```json
{ "symbol": "AuthService" }
```

Usage notes:

- Works best when `python3` is available during indexing.
- Returns matching classes/functions, decorators, bases, async metadata, and calls.
- If AST data is unavailable, output may be sparse.

### 8) `auto_understand_codebase`

Produces automatic architecture understanding without needing a user question.

Input:

```json
{
  "tokenBudget": 400,
  "style": "compact"
}
```

Allowed `style` values:

- `compact` (default)
- `caveman` (minimal-token style)

Usage notes:

- `tokenBudget` default is `500`.
- Use `tokenBudget: 250-400` + `style: "caveman"` for low-token workflows.
- Returns overview, top domains, critical files, Python flows, and execution plan.

### 9) `architecture_diagram`

Generates Mermaid dependency diagram centered on high fan-in modules.

Input:

```json
{
  "maxNodes": 12,
  "style": "compact"
}
```

Allowed `style` values:

- `compact` (default)
- `caveman`

Usage notes:

- `maxNodes` default is `14`.
- Low-token recommendation: `maxNodes: 8-12`, `style: "caveman"`.
- Returns Mermaid text, narrative, and node count.

### 10) `review_pr_impact`

Analyzes PR-level architectural impact by diffing git refs and scoring dependency blast radius.

Input:

```json
{
  "repoPath": "/absolute/path/to/repo",
  "baseRef": "main",
  "headRef": "HEAD",
  "maxFiles": 200,
  "transitiveDepth": 3,
  "commentStyle": "full"
}
```

Usage notes:

- `repoPath` is required and must point to a git repository.
- Uses `git diff --name-only baseRef...headRef` (fallback to `..`).
- Maps changed files to indexed paths and computes direct/transitive impact.
- Returns risk score/level, domains touched, review checklist, Mermaid impact diagram, and `prCommentMarkdown` (ready to paste into PR comments).
- `commentStyle` supports `full` (default, includes diagram/details) or `compact` (short CI-friendly summary).

### 11) `review_pr_impact_from_files`

Analyzes PR-level architectural impact from an explicit changed-file list (ideal for CI pipelines).

Input:

```json
{
  "changedFiles": [
    "backend/routers/chat.py",
    "backend/services/orchestrator.py",
    "backend/utils/sse.py"
  ],
  "rootPath": "/absolute/path/to/repo",
  "maxFiles": 300,
  "transitiveDepth": 3,
  "commentStyle": "full"
}
```

Usage notes:

- `changedFiles` is required and should be repository-relative paths.
- Best when your CI already has changed files from GitHub/GitLab APIs.
- Avoids local git ref assumptions in sandbox/ephemeral CI runtimes.
- Returns the same risk/checklist/diagram structure as `review_pr_impact`, including `prCommentMarkdown`.
- Accepts optional `unifiedDiff` and `commentStyle` for richer symbol weighting and output control.
- If no in-memory index exists, provide `rootPath` so it can fall back to persisted graph DB.

### 12) `review_github_pr_impact`

Analyzes a GitHub PR directly using `gh` CLI, with optional auto-comment posting.

Input:

```json
{
  "repoPath": "/absolute/path/to/repo",
  "prNumber": 42,
  "repo": "owner/name",
  "maxFiles": 300,
  "transitiveDepth": 3,
  "commentStyle": "full",
  "autoComment": false,
  "forceNewComment": false
}
```

Usage notes:

- Requires authenticated `gh` CLI in the runtime environment.
- Fetches PR files + patch via `gh pr view` and `gh pr diff`.
- Applies symbol-level weighting from diff hunks (V2 behavior).
- When `autoComment: true`, upserts a single marker-based Code Digger comment (updates existing comment if found, otherwise creates one).
- Set `forceNewComment: true` to always create a new comment instead of updating.
- `commentStyle: compact` is useful when posting shorter bot comments.

### 13) `graph_db_status`

Shows persisted graph database status for a repository.

Input:

```json
{
  "rootPath": "/absolute/path/to/repo"
}
```

Usage notes:

- Returns whether graph DB exists plus metadata (`nodeCount`, `edgeCount`, `sizeBytes`, timestamp).
- Created/updated automatically during `ingest_repo`.

### 14) `graph_db_neighbors`

Queries neighbors from the persisted graph database without requiring a fresh ingest in the same session.

Input:

```json
{
  "rootPath": "/absolute/path/to/repo",
  "filePath": "backend/services/orchestrator.py",
  "direction": "both",
  "depth": 2,
  "maxNodes": 200
}
```

Usage notes:

- `filePath` can be absolute or repo-relative suffix.
- If suffix matches multiple files, tool returns `ambiguous: true` with candidate paths.
- `direction` supports `forward`, `reverse`, or `both`.
- Useful for very large monorepos where you want cheap graph traversals after initial ingest.

---

## Recommended usage workflows

### Workflow A: First-time orientation

1. `ingest_repo`
2. `summarize_scope` (no args)
3. `auto_understand_codebase`
4. `architecture_diagram`

### Workflow B: Answer a specific engineering question

1. `ask_codebase` with concrete question
2. `trace_feature` for the same area
3. `impact_analysis` for planned edit targets
4. `review_pr_impact` before opening or merging PR

### Workflow E: CI/CD PR gate review

1. Generate changed file list in CI
2. `review_pr_impact_from_files` with that list
3. Fail/warn pipeline on `riskLevel: "high"` unless override is present

### Workflow F: GitHub-native PR review

1. `review_github_pr_impact` with `prNumber`
2. Inspect `riskLevel`, `symbolLevelChanges`, and `reviewChecklist`
3. Optionally set `autoComment: true` to post markdown review directly (default is idempotent upsert)
4. Set `forceNewComment: true` only if you want a fresh historical comment on every run

### Workflow G: Very-large monorepo graph queries

1. Run `ingest_repo` once to create `.code-digger/graph-db.json`
2. Run `graph_db_status` to confirm persisted graph metadata
3. Use `graph_db_neighbors` for dependency traversals without re-ingesting

### Workflow C: Onboarding plan by seniority

1. `summarize_scope`
2. `learning_path` with `beginner|senior|architect`
3. Use returned domain hints as read order

### Workflow D: Python-heavy service deep dive

1. Ensure `python3` is available
2. `ingest_repo`
3. `python_symbol_insight`
4. `trace_feature` for runtime path context

---

## Prompt cookbook (copy-paste, with outputs explained)

Use these directly in any MCP-enabled assistant after indexing.

### 1) Bug triage

Prompt:

```text
Run trace_feature for "Orca chat execution SSE flow" and show likely breakpoints.
```

What command does:

- Locates semantically relevant files
- Builds `canonicalFlow` for one deterministic path
- Adds alternate bridge paths and dependency context

Expected output shape:

```json
{
  "feature": "...",
  "seedFiles": ["..."],
  "canonicalFlow": ["routers/chat.py", "services/orchestrator.py", "services/ai_service.py", "utils/sse.py"],
  "priorityFlow": [{ "from": "...", "to": "...", "path": ["..."] }],
  "trace": [{ "file": "...", "upstream": ["..."], "downstream": ["..."] }]
}
```

Prompt:

```text
Use ask_codebase to find where retries and timeouts are implemented for failed uploads.
```

What command does:

- Ranks files by semantic relevance
- Returns top files + architecture context for first target

Expected output shape:

```json
{
  "answer": "Most relevant area appears to be ...",
  "topFiles": [{ "path": "...", "score": 0.42, "summary": "...", "capabilityTags": ["reliability"] }],
  "architectureContext": { "directlyUses": ["..."], "directlyUsedBy": ["..."] }
}
```

Prompt:

```text
Run impact_analysis on backend/routers/chat.py and list highest-risk dependents first.
```

What command does:

- Computes direct + transitive impact graph
- Returns risk score + recommendation text

Expected output shape:

```json
{
  "filePath": ".../backend/routers/chat.py",
  "directDependents": ["..."],
  "transitiveDependents": ["..."],
  "riskScore": 39,
  "recommendation": "Moderate impact. Validate direct contracts and run integration tests on dependent modules."
}
```

### 2) Onboarding

Prompt:

```text
Run summarize_scope for the whole repo and identify top domains.
```

What command does:

- Returns repo-level architecture compression
- Shows broad domain buckets and file counts

Expected output shape:

```json
{
  "level": "repo",
  "stats": { "fileCount": 1234, "languageBreakdown": { "python": 420 } },
  "architecture": [{ "domain": "api", "files": 180, "topSymbols": ["..."] }]
}
```

Prompt:

```text
Run learning_path for beginner and give me a 2-day read order.
```

What command does:

- Produces role-specific plan
- Suggests domain-first reading strategy

Expected output shape:

```json
{
  "role": "beginner",
  "plan": ["Start with repository summary...", "..."],
  "suggestedDomains": [{ "domain": "authentication", "readFirst": ["..."] }]
}
```

Prompt:

```text
Trace core user journey end to end and explain each hop briefly.
```

What command does:

- Uses `trace_feature` and then narrates `canonicalFlow`
- Adds upstream/downstream context per hop

### 3) Refactor planning

Prompt:

```text
Use impact_analysis on src/services/auth.ts and propose a staged rollout plan.
```

What command does:

- Finds blast radius around the target module
- Helps sequence migration/testing by fan-out risk

Prompt:

```text
Use ask_codebase to find all modules that couple to session/token handling.
```

What command does:

- Finds coupling candidates semantically
- Returns likely ownership files for auth/session concerns

Prompt:

```text
Trace feature checkout retry flow and identify boundaries safe for extraction.
```

What command does:

- Produces primary path + alternates
- Surfaces low-coupling boundaries from trace graph

### 4) Performance investigation

Prompt:

```text
Find where queue/backoff/timeout logic is implemented using ask_codebase.
```

Prompt:

```text
Run trace_feature for slow report generation flow and list expensive fan-out points.
```

Prompt:

```text
Run impact_analysis for services/orchestrator.py before optimization changes.
```

How to interpret outputs:

- High `riskScore` + large `transitiveDependents` means optimize carefully behind flags
- Large `directDependencies` suggests broad downstream coupling

### 5) Python service deep dive

Prompt:

```text
Run python_symbol_insight for AuthService and show decorators, inheritance, and calls.
```

Expected output shape:

```json
{
  "symbol": "AuthService",
  "matches": [
    {
      "file": ".../auth.py",
      "classes": [{ "name": "AuthService", "bases": ["BaseService"], "decorators": ["dataclass"] }],
      "functions": [{ "name": "validate_token", "isAsync": true, "calls": ["jwt.decode"] }]
    }
  ]
}
```

Prompt:

```text
Trace credential injection flow and include Python call context in the output.
```

Prompt:

```text
Find where waiting_approval and waiting_credentials behaviors are coordinated.
```

### 6) Architecture review

Prompt:

```text
Run auto_understand_codebase with tokenBudget 350 and style caveman.
```

Prompt:

```text
Run architecture_diagram with maxNodes 10 and explain the top fan-in files.
```

Prompt:

```text
Run review_pr_impact with repoPath "/absolute/path/to/repo", baseRef "main", headRef "HEAD", and commentStyle "compact". Summarize risk and checklist.
```

Prompt:

```text
Run review_pr_impact_from_files with changedFiles ["backend/routers/chat.py","backend/services/orchestrator.py","backend/utils/sse.py"], transitiveDepth 3, and commentStyle "compact". Summarize risk and top checklist items.
```

Prompt:

```text
Run review_github_pr_impact with repoPath "/absolute/path/to/repo", prNumber 42, repo "owner/name", commentStyle "compact", and autoComment false. Return risk summary and prCommentMarkdown.
```

Prompt:

```text
Run graph_db_neighbors with rootPath "/absolute/path/to/repo", filePath "backend/services/orchestrator.py", direction "both", depth 2, maxNodes 200. Summarize upstream/downstream hotspots.
```

Expected output shape:

```json
{
  "diagramType": "mermaid",
  "mermaid": "graph TD ...",
  "narrative": "...",
  "nodes": 10
}
```

Expected PR-impact output shape:

```json
{
  "refs": { "baseRef": "main", "headRef": "HEAD" },
  "changedFileCount": 9,
  "mappedChangedFiles": ["..."],
  "domainsTouched": ["api", "reliability"],
  "impact": {
    "directDependents": ["..."],
    "transitiveDependents": ["..."],
    "hotspotsTouched": ["..."]
  },
  "riskScore": 72,
  "riskLevel": "high",
  "reviewChecklist": ["..."],
  "diagram": { "type": "mermaid", "mermaid": "graph TD ..." },
  "prCommentMarkdown": "## PR Architecture Impact Review\n..."
}
```

Expected explicit-files PR-impact output shape:

```json
{
  "source": "explicit_changed_files",
  "mode": "graph-db-fallback",
  "changedFileCount": 3,
  "mappedChangedFiles": ["..."],
  "riskLevel": "moderate",
  "reviewChecklist": ["..."],
  "diagram": { "type": "mermaid", "mermaid": "graph TD ..." },
  "prCommentMarkdown": "## PR Architecture Impact Review\n..."
}
```

Expected GitHub PR-impact output shape:

```json
{
  "github": { "prNumber": 42, "title": "...", "url": "...", "baseRef": "main", "headRef": "feature-x" },
  "autoCommentRequested": false,
  "forceNewComment": false,
  "commentPosted": false,
  "commentAction": "none",
  "riskLevel": "high",
  "impact": {
    "symbolLevelChanges": [
      { "file": "backend/routers/chat.py", "symbols": ["stream_chat"], "hunkCount": 3, "addedLines": 28, "removedLines": 4 }
    ]
  },
  "prCommentMarkdown": "## PR Architecture Impact Review\n..."
}
```

Expected Graph DB-neighbors output shape:

```json
{
  "found": true,
  "filePath": ".../backend/services/orchestrator.py",
  "direction": "both",
  "direct": {
    "forward": ["..."],
    "reverse": ["..."]
  },
  "traversal": {
    "forward": ["..."],
    "reverse": ["..."]
  }
}
```

### Cookbook execution flow diagram

```mermaid
sequenceDiagram
  participant U as Engineer
  participant A as MCP Client
  participant C as Code Digger
  U->>A: Ask question / run prompt
  A->>C: call tool (ask_codebase / trace_feature / impact_analysis / review_pr_impact / review_pr_impact_from_files / review_github_pr_impact)
  C-->>A: JSON result (ranked files, graph context, recommendations)
  A-->>U: Explanation + next action list
```

### Quick copy blocks (raw prompts only)

#### Quick copy: Orientation

```text
Run ingest_repo with rootPath "/absolute/path/to/repo".
Run summarize_scope with no scopePath.
Run auto_understand_codebase with tokenBudget 350 and style "compact".
Run architecture_diagram with maxNodes 10 and style "compact".
```

#### Quick copy: Feature investigation

```text
Run ask_codebase with question "How does auth session invalidation work?" and topK 8.
Run trace_feature with feature "auth session invalidation flow".
Run impact_analysis with filePath "backend/services/auth_service.py".
```

#### Quick copy: Bug triage

```text
Run trace_feature for "Orca chat execution SSE flow" and show likely breakpoints.
Use ask_codebase to find where retries and timeouts are implemented for failed uploads.
Run impact_analysis on backend/routers/chat.py and list highest-risk dependents first.
```

#### Quick copy: Onboarding

```text
Run summarize_scope for the whole repo and identify top domains.
Run learning_path for beginner and give me a 2-day read order.
Trace core user journey end to end and explain each hop briefly.
```

#### Quick copy: Refactor planning

```text
Use impact_analysis on src/services/auth.ts and propose a staged rollout plan.
Use ask_codebase to find all modules that couple to session/token handling.
Trace feature checkout retry flow and identify boundaries safe for extraction.
```

#### Quick copy: Performance investigation

```text
Find where queue/backoff/timeout logic is implemented using ask_codebase.
Run trace_feature for slow report generation flow and list expensive fan-out points.
Run impact_analysis for services/orchestrator.py before optimization changes.
```

#### Quick copy: Python deep dive

```text
Run python_symbol_insight for AuthService and show decorators, inheritance, and calls.
Trace credential injection flow and include Python call context in the output.
Find where waiting_approval and waiting_credentials behaviors are coordinated.
```

#### Quick copy: Low-token mode

```text
Run auto_understand_codebase with tokenBudget 250 and style "caveman".
Run architecture_diagram with maxNodes 8 and style "caveman".
Summarize cross-domain coupling hotspots and likely simplification targets.
```

#### Quick copy: PR architecture review

```text
Run review_pr_impact with repoPath "/absolute/path/to/repo", baseRef "main", headRef "HEAD", maxFiles 200, transitiveDepth 3, and commentStyle "compact".
Return prCommentMarkdown and use it as a ready-to-paste PR comment.
```

#### Quick copy: PR architecture review (CI file list)

```text
Run review_pr_impact_from_files with changedFiles ["backend/routers/chat.py","backend/services/orchestrator.py","backend/utils/sse.py"], rootPath "/absolute/path/to/repo", maxFiles 300, transitiveDepth 3, and commentStyle "compact".
Return prCommentMarkdown and use it as a ready-to-paste PR comment.
```

#### Quick copy: GitHub PR review

```text
Run review_github_pr_impact with repoPath "/absolute/path/to/repo", prNumber 42, repo "owner/name", maxFiles 300, transitiveDepth 3, commentStyle "compact", autoComment false, and forceNewComment false.
Return riskLevel, symbolLevelChanges, and prCommentMarkdown.
```

Set `autoComment true` in CI to maintain a single upserted Code Digger review comment on the PR.

#### Quick copy: Graph DB queries

```text
Run graph_db_status with rootPath "/absolute/path/to/repo".
Run graph_db_neighbors with rootPath "/absolute/path/to/repo", filePath "backend/services/orchestrator.py", direction "both", depth 2, and maxNodes 200.
Return direct and traversal neighbors and flag high-fanout files.
```

---

## NPM scripts reference

- `npm run build` - compile TypeScript to `dist/`
- `npm run dev` - run MCP server from source via `tsx`
- `npm run start` - run built server (`node dist/main.js`)
- `npm run lint` - TypeScript no-emit type check
- `npm test` - run test suite
- `npm run install:mcp` - generic MCP installer script
- `npm run install:claude` - install for Claude
- `npm run install:cursor` - install for Cursor
- `npm run install:codex` - install for Codex
- `npm run install:antigravity` - install for Antigravity

---

## Configuration defaults

Current index defaults include:

- Max files: `100000`
- Max file size: `768 KB`
- Heavy folders skipped (`node_modules`, `dist`, `build`, `.git`, etc.)
- Multi-language file support via extension
- Local embedding provider: `local-hash-ngram` (default)
- Embedding dimension: `192`

Tune in `src/config.ts`.

### Optional remote embedding provider

Code Digger supports an OpenAI-compatible embedding endpoint with automatic local fallback.

Set environment variables:

```bash
export CODE_DIGGER_EMBEDDING_PROVIDER=remote
export CODE_DIGGER_EMBEDDING_API_URL="https://api.openai.com/v1/embeddings"
export CODE_DIGGER_EMBEDDING_API_KEY="<your-api-key>"
export CODE_DIGGER_EMBEDDING_MODEL="text-embedding-3-small"
export CODE_DIGGER_EMBEDDING_DIMENSION=192
export CODE_DIGGER_EMBEDDING_BATCH_SIZE=64
```

Behavior:

- If remote config is complete, indexing uses remote embeddings.
- Query embeddings are generated only when provider metadata matches the active index provider.
- If any remote batch fails, Code Digger falls back to local embeddings for the full indexing run (single consistent vector space).
- If remote config is incomplete, Code Digger falls back to local embeddings.
- Index stats include active provider metadata under `stats.embeddings`.

## Python support details

Code Digger has two Python analysis layers:

- Baseline parsing (imports/symbols/tokens)
- Deep AST parsing via `python3`

AST mode extracts:

- Class inheritance chains
- Decorators
- Async/sync signatures
- Function-level call graph

If `python3` is missing, indexing still works with baseline parsing.

---

## Troubleshooting (exhaustive)

### Tool not visible in client

- Restart MCP client after install.
- Confirm config file path is correct for your platform.
- Confirm `mcpServers.code-digger` exists in config JSON.

### "Repository not indexed yet. Run ingest_repo first."

- This is expected in a fresh server session.
- Run `ingest_repo` before other tools.

### No/weak answer quality

- Re-run `ingest_repo` after large code changes.
- Increase `topK` in `ask_codebase`.
- Use more specific domain wording in your question/feature prompt.

### Python insight missing

- Confirm `python3 --version` works.
- Re-run `ingest_repo` after fixing Python availability.

### Config points to wrong server path

- Re-run installer from repository root.
- Ensure `dist/main.js` exists (`npm run build`).

### Build or runtime errors

- Remove stale artifacts and rebuild:

```bash
rm -rf dist
npm install
npm run build
```

---

## Token-efficient settings

For minimal output tokens:

- Use `style: "caveman"` where available
- `auto_understand_codebase` with `tokenBudget: 250-400`
- `architecture_diagram` with `maxNodes: 8-12`
- Ask specific, narrow questions in `ask_codebase` / `trace_feature`

## Roadmap

- Graph database backing for very large monorepos (implemented: `graph_db_status`, `graph_db_neighbors`, persisted `.code-digger/graph-db.json`)
- Embedding model integration for stronger semantic retrieval (implemented: local + optional OpenAI-compatible remote provider in hybrid retrieval)
- Runtime trace ingestion (OpenTelemetry/logs/APM)
- Drift detection across git history
- PR-level architecture impact review (implemented: `review_pr_impact`, `review_pr_impact_from_files`, `review_github_pr_impact`)

## License

MIT
