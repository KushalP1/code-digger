import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDependencyGraph } from "../src/architecture.js";
import { DEFAULT_EMBEDDING_DIMENSION, embedText } from "../src/embeddings.js";
import { askCodebase } from "../src/qa.js";
import { FileInfo, RepoIndex } from "../src/types.js";

function mkFile(path: string, tokens: Array<[string, number]>, summary: string): FileInfo {
  return {
    path,
    language: "typescript",
    sizeBytes: 120,
    lineCount: 12,
    imports: [],
    symbols: [],
    tokens: new Map(tokens),
    summary,
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
      totalBytes: 500,
      totalLines: 50,
      languageBreakdown: { typescript: files.size },
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
      ["loginflow", 1.5],
      ["billing", 1.3]
    ]),
    fileEmbeddings,
    embeddingDimension: DEFAULT_EMBEDDING_DIMENSION,
    dependencyGraph: graph.forward,
    reverseDependencyGraph: graph.reverse,
    pythonCallGraph: new Map()
  };
}

describe("embedding-based retrieval", () => {
  it("retrieves morphologically similar terms even with weak lexical overlap", () => {
    const files = new Map<string, FileInfo>([
      [
        "/repo/src/loginflow.ts",
        mkFile(
          "/repo/src/loginflow.ts",
          [["loginflow", 6]],
          "Handles loginflow orchestration and sign-in verification pipeline."
        )
      ],
      [
        "/repo/src/billing.ts",
        mkFile(
          "/repo/src/billing.ts",
          [["billing", 6]],
          "Handles billing and invoices for subscription renewals."
        )
      ]
    ]);
    const index = makeIndex(files);
    const result = askCodebase(index, "How does login flow verification work?", 2);
    assert.ok(result.topFiles.length >= 1);
    assert.equal(result.topFiles[0].path, "/repo/src/loginflow.ts");
  });
});
