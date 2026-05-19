import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDependencyGraph } from "../src/architecture.js";
import { analyzePrImpact, reviewPrImpactFromFiles } from "../src/prImpact.js";
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
  return {
    stats: {
      rootPath: "/repo",
      indexedAt: new Date().toISOString(),
      fileCount: files.size,
      totalBytes: 1000,
      totalLines: 100,
      languageBreakdown: { python: files.size },
      topCapabilities: { api: files.size }
    },
    files,
    tfidfNorms: new Map([...files.values()].map((file) => [file.path, 1])),
    inverseDocumentFrequency: new Map([
      ["orca", 1],
      ["chat", 1]
    ]),
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
    };

    assert.equal(typed.mappedChangedFiles.length, 1);
    assert.ok(typed.impact.transitiveDependencies.includes("/repo/backend/services/orchestrator.py"));
    assert.ok(typed.riskScore > 0);
    assert.ok(["low", "moderate", "high"].includes(typed.riskLevel));
    assert.ok(typed.reviewChecklist.length >= 2);
    assert.match(typed.diagram.mermaid, /^graph TD/m);
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
    };
    assert.equal(typed.mappedChangedFiles.length, 1);
    assert.equal(typed.unresolvedChangedFiles.length, 1);
    assert.ok(typed.summary.length > 10);
  });

  it("supports explicit changed-file list mode for CI pipelines", () => {
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
    const result = reviewPrImpactFromFiles(index, {
      changedFiles: ["backend/routers/chat.py", "backend/services/orchestrator.py"],
      transitiveDepth: 3
    }) as {
      source: string;
      changedFileCount: number;
      analyzedFileCount: number;
      mappedChangedFiles: string[];
      riskScore: number;
    };

    assert.equal(result.source, "explicit_changed_files");
    assert.equal(result.changedFileCount, 2);
    assert.equal(result.analyzedFileCount, 2);
    assert.ok(result.mappedChangedFiles.length >= 1);
    assert.ok(result.riskScore > 0);
  });
});
