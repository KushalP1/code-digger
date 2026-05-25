import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDependencyGraph } from "../src/architecture.js";
import { DEFAULT_EMBEDDING_DIMENSION, embedText } from "../src/embeddings.js";
import { impactAnalysis, traceFeature } from "../src/qa.js";
import { FileInfo, RepoIndex } from "../src/types.js";

function mkFile(path: string, imports: string[], tokenPairs: Array<[string, number]>): FileInfo {
  return {
    path,
    language: "python",
    sizeBytes: 100,
    lineCount: 10,
    imports,
    symbols: [],
    tokens: new Map(tokenPairs),
    summary: `summary for ${path}`,
    capabilityTags: ["api"]
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
      totalBytes: 400,
      totalLines: 40,
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
      ["chat", 1],
      ["orca", 1],
      ["sse", 1],
      ["execution", 1]
    ]),
    fileEmbeddings,
    embeddingDimension: DEFAULT_EMBEDDING_DIMENSION,
    dependencyGraph: graph.forward,
    reverseDependencyGraph: graph.reverse,
    pythonCallGraph: new Map()
  };
}

describe("dependency graph resolver", () => {
  it("resolves python absolute imports for impact analysis", () => {
    const files = new Map<string, FileInfo>([
      [
        "/repo/backend/routers/chat.py",
        mkFile(
          "/repo/backend/routers/chat.py",
          ["services.orchestrator", "utils.sse"],
          [["chat", 5], ["orca", 3], ["sse", 1]]
        )
      ],
      [
        "/repo/backend/services/orchestrator.py",
        mkFile(
          "/repo/backend/services/orchestrator.py",
          ["utils.sse"],
          [["execution", 3], ["orca", 2], ["sse", 1]]
        )
      ],
      [
        "/repo/backend/utils/sse.py",
        mkFile("/repo/backend/utils/sse.py", [], [["sse", 6], ["stream", 4]])
      ],
      [
        "/repo/backend/routers/orca_chats.py",
        mkFile(
          "/repo/backend/routers/orca_chats.py",
          ["utils.sse"],
          [["chat", 3], ["orca", 4], ["sse", 2]]
        )
      ]
    ]);
    const index = makeIndex(files);

    const impact = impactAnalysis(index, "backend/routers/chat.py") as {
      directDependencies: string[];
      riskScore: number;
      transitiveDependencies: string[];
    };

    assert.ok(impact.directDependencies.includes("/repo/backend/services/orchestrator.py"));
    assert.ok(impact.directDependencies.includes("/repo/backend/utils/sse.py"));
    assert.ok(impact.transitiveDependencies.length >= 2);
    assert.ok(impact.riskScore > 0);
  });

  it("expands feature trace beyond top semantic seed files", () => {
    const files = new Map<string, FileInfo>([
      [
        "/repo/backend/routers/chat.py",
        mkFile("/repo/backend/routers/chat.py", ["services.orchestrator"], [
          ["chat", 5],
          ["orca", 2]
        ])
      ],
      [
        "/repo/backend/services/orchestrator.py",
        mkFile("/repo/backend/services/orchestrator.py", ["services.ai_service"], [
          ["execution", 5],
          ["orca", 2]
        ])
      ],
      [
        "/repo/backend/services/ai_service.py",
        mkFile("/repo/backend/services/ai_service.py", ["utils.sse"], [
          ["ai", 4],
          ["execution", 3]
        ])
      ],
      [
        "/repo/backend/utils/sse.py",
        mkFile("/repo/backend/utils/sse.py", [], [
          ["sse", 6],
          ["stream", 3]
        ])
      ]
    ]);
    const index = makeIndex(files);

    const trace = traceFeature(index, "orca chat execution sse") as {
      seedFiles: string[];
      trace: Array<{ file: string }>;
      transitiveDownstream: string[];
      priorityFlow: Array<{ path: string[] }>;
      prioritizedBridgeFiles: string[];
      canonicalFlow: string[];
    };

    assert.ok(trace.seedFiles.length >= 1);
    assert.ok(trace.trace.some((node) => node.file === "/repo/backend/utils/sse.py"));
    assert.ok(trace.transitiveDownstream.length >= 2);
    assert.ok(trace.prioritizedBridgeFiles.includes("/repo/backend/services/ai_service.py"));
    assert.ok(
      trace.priorityFlow.some((flow) => flow.path.includes("/repo/backend/services/ai_service.py"))
    );
    const chatIdx = trace.canonicalFlow.indexOf("/repo/backend/routers/chat.py");
    const orchestratorIdx = trace.canonicalFlow.indexOf("/repo/backend/services/orchestrator.py");
    const aiServiceIdx = trace.canonicalFlow.indexOf("/repo/backend/services/ai_service.py");
    const sseIdx = trace.canonicalFlow.indexOf("/repo/backend/utils/sse.py");
    assert.ok(chatIdx >= 0);
    assert.ok(orchestratorIdx > chatIdx);
    assert.ok(aiServiceIdx > orchestratorIdx);
    assert.ok(sseIdx > aiServiceIdx);
  });
});
