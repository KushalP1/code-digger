import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildDependencyGraph } from "../src/architecture.js";
import { DEFAULT_EMBEDDING_DIMENSION, embedText } from "../src/embeddings.js";
import { saveGraphDb } from "../src/graphDb.js";
import {
  analyzePrImpact,
  extractSymbolChangeHintsFromDiff,
  reviewPrImpactFromFiles
} from "../src/prImpact.js";
import { FileInfo, RepoIndex } from "../src/types.js";

function mkFile(path: string, imports: string[], capabilities: string[] = ["api"]): FileInfo {
  return {
    path,
    language: "python",
    sizeBytes: 120,
    lineCount: 12,
    imports,
    symbols: [],
    tokens: new Map([
      ["orca", 1],
      ["chat", 1]
    ]),
    summary: `summary for ${path}`,
    capabilityTags: capabilities
  };
}

function makeIndex(files: Map<string, FileInfo>): RepoIndex {
  const graph = buildDependencyGraph(files);
  const fileEmbeddings = new Map<string, number[]>(
    [...files.values()].map((file) => [file.path, embedText(`${file.path}\n${file.summary}`)])
  );
  return {
    stats: {
      rootPath: "/repo",
      indexedAt: new Date().toISOString(),
      fileCount: files.size,
      totalBytes: 1000,
      totalLines: 100,
      languageBreakdown: { python: files.size },
      topCapabilities: { api: files.size },
      embeddings: {
        provider: "test-local-hash-ngram",
        dimension: DEFAULT_EMBEDDING_DIMENSION,
        embeddedFiles: fileEmbeddings.size
      }
    },
    files,
    tfidfNorms: new Map([...files.values()].map((file) => [file.path, 1])),
    inverseDocumentFrequency: new Map([
      ["orca", 1],
      ["chat", 1]
    ]),
    fileEmbeddings,
    embeddingDimension: DEFAULT_EMBEDDING_DIMENSION,
    dependencyGraph: graph.forward,
    reverseDependencyGraph: graph.reverse,
    pythonCallGraph: new Map()
  };
}

describe("pr impact review", () => {
  it("aggregates architectural impact for changed files", () => {
    const files = new Map<string, FileInfo>([
      [
        "/repo/backend/routers/chat.py",
        mkFile("/repo/backend/routers/chat.py", ["services.orchestrator"], ["api", "reliability"])
      ],
      [
        "/repo/backend/services/orchestrator.py",
        mkFile("/repo/backend/services/orchestrator.py", ["services.ai_service"], [
          "api",
          "reliability"
        ])
      ],
      [
        "/repo/backend/services/ai_service.py",
        mkFile("/repo/backend/services/ai_service.py", ["utils.sse"], ["api"])
      ],
      ["/repo/backend/utils/sse.py", mkFile("/repo/backend/utils/sse.py", [], ["reliability"])]
    ]);
    const index = makeIndex(files);

    const result = analyzePrImpact(index, ["backend/routers/chat.py"]);
    const typed = result as {
      mappedChangedFiles: string[];
      riskScore: number;
      riskLevel: string;
      impact: { transitiveDependencies: string[] };
      reviewChecklist: string[];
      diagram: { mermaid: string };
      prCommentMarkdown: string;
    };

    assert.equal(typed.mappedChangedFiles.length, 1);
    assert.ok(typed.impact.transitiveDependencies.includes("/repo/backend/services/orchestrator.py"));
    assert.ok(typed.riskScore > 0);
    assert.ok(["low", "moderate", "high"].includes(typed.riskLevel));
    assert.ok(typed.reviewChecklist.length >= 2);
    assert.match(typed.diagram.mermaid, /^graph TD/m);
    assert.match(typed.prCommentMarkdown, /code-digger-pr-impact-review/);
    assert.match(typed.prCommentMarkdown, /## PR Architecture Impact Review/);
    assert.match(typed.prCommentMarkdown, /```mermaid/);
  });

  it("reports unresolved changed files not in index", () => {
    const files = new Map<string, FileInfo>([
      ["/repo/backend/utils/sse.py", mkFile("/repo/backend/utils/sse.py", [], ["reliability"])]
    ]);
    const index = makeIndex(files);
    const result = analyzePrImpact(index, ["backend/routers/unknown.py", "backend/utils/sse.py"]);
    const typed = result as {
      mappedChangedFiles: string[];
      unresolvedChangedFiles: string[];
      summary: string;
      prCommentMarkdown: string;
    };
    assert.equal(typed.mappedChangedFiles.length, 1);
    assert.equal(typed.unresolvedChangedFiles.length, 1);
    assert.ok(typed.summary.length > 10);
    assert.match(typed.prCommentMarkdown, /Unresolved files/);
  });

  it("supports explicit changed-file list mode for CI pipelines", async () => {
    const files = new Map<string, FileInfo>([
      [
        "/repo/backend/routers/chat.py",
        mkFile("/repo/backend/routers/chat.py", ["services.orchestrator"], ["api"])
      ],
      [
        "/repo/backend/services/orchestrator.py",
        mkFile("/repo/backend/services/orchestrator.py", ["services.ai_service"], ["reliability"])
      ],
      ["/repo/backend/services/ai_service.py", mkFile("/repo/backend/services/ai_service.py", [])]
    ]);
    const index = makeIndex(files);
    const result = (await reviewPrImpactFromFiles(index, {
      changedFiles: ["backend/routers/chat.py", "backend/services/orchestrator.py"],
      transitiveDepth: 3
    })) as {
      source: string;
      changedFileCount: number;
      analyzedFileCount: number;
      mappedChangedFiles: string[];
      riskScore: number;
      prCommentMarkdown: string;
    };

    assert.equal(result.source, "explicit_changed_files");
    assert.equal(result.changedFileCount, 2);
    assert.equal(result.analyzedFileCount, 2);
    assert.ok(result.mappedChangedFiles.length >= 1);
    assert.ok(result.riskScore > 0);
    assert.match(result.prCommentMarkdown, /\*\*Source:\*\*\s+`explicit_changed_files`/);
  });

  it("parses diff hunks and applies symbol-level weighting", () => {
    const files = new Map<string, FileInfo>([
      [
        "/repo/backend/routers/chat.py",
        mkFile("/repo/backend/routers/chat.py", ["services.orchestrator"], ["api"])
      ],
      [
        "/repo/backend/services/orchestrator.py",
        mkFile("/repo/backend/services/orchestrator.py", [], ["reliability"])
      ]
    ]);
    const index = makeIndex(files);
    const diff = [
      "diff --git a/backend/routers/chat.py b/backend/routers/chat.py",
      "index 111..222 100644",
      "--- a/backend/routers/chat.py",
      "+++ b/backend/routers/chat.py",
      "@@ -10,0 +11,8 @@ def stream_chat(request):",
      "+def stream_chat(request):",
      "+    return orchestrate(request)",
      "@@ -30,0 +35,6 @@ class ChatController:",
      "+class ChatController:",
      "+    pass"
    ].join("\n");

    const symbolHints = extractSymbolChangeHintsFromDiff(diff);
    const noHints = analyzePrImpact(index, ["backend/routers/chat.py"]) as { riskScore: number };
    const withHints = analyzePrImpact(index, ["backend/routers/chat.py"], { symbolHints }) as {
      riskScore: number;
      impact: { symbolLevelChanges: Array<{ symbols: string[]; hunkCount: number }> };
      prCommentMarkdown: string;
    };

    assert.ok(withHints.riskScore > noHints.riskScore);
    assert.ok(withHints.impact.symbolLevelChanges.length >= 1);
    assert.ok(withHints.impact.symbolLevelChanges[0].symbols.includes("stream_chat"));
    assert.equal(withHints.impact.symbolLevelChanges[0].hunkCount, 2);
    assert.match(withHints.prCommentMarkdown, /Symbol-Level Changes/);
  });

  it("supports compact markdown comment style", async () => {
    const files = new Map<string, FileInfo>([
      ["/repo/backend/routers/chat.py", mkFile("/repo/backend/routers/chat.py", ["services.orchestrator"])],
      ["/repo/backend/services/orchestrator.py", mkFile("/repo/backend/services/orchestrator.py", [])]
    ]);
    const index = makeIndex(files);
    const result = (await reviewPrImpactFromFiles(index, {
      changedFiles: ["backend/routers/chat.py"],
      commentStyle: "compact"
    })) as {
      prCommentMarkdown: string;
    };
    assert.match(result.prCommentMarkdown, /## PR Architecture Impact Review/);
    assert.match(result.prCommentMarkdown, /### Checklist/);
    assert.ok(!result.prCommentMarkdown.includes("### Impact Diagram"));
    assert.ok(!result.prCommentMarkdown.includes("```mermaid"));
  });

  it("falls back to persisted graph db when index is unavailable", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "code-digger-pr-fallback-"));
    const f1 = path.join(repoRoot, "backend/routers/chat.py");
    const f2 = path.join(repoRoot, "backend/services/orchestrator.py");
    const f3 = path.join(repoRoot, "backend/utils/sse.py");
    const forward = new Map<string, Set<string>>([
      [f1, new Set([f2])],
      [f2, new Set([f3])],
      [f3, new Set<string>()]
    ]);
    const reverse = new Map<string, Set<string>>([
      [f1, new Set<string>()],
      [f2, new Set([f1])],
      [f3, new Set([f2])]
    ]);
    await saveGraphDb(repoRoot, forward, reverse);
    const result = (await reviewPrImpactFromFiles(null, {
      changedFiles: ["backend/routers/chat.py"],
      rootPath: repoRoot
    })) as {
      mode: string;
      mappedChangedFiles: string[];
      riskScore: number;
    };
    assert.equal(result.mode, "graph-db-fallback");
    assert.equal(result.mappedChangedFiles.length, 1);
    assert.ok(result.riskScore > 0);
  });
});
