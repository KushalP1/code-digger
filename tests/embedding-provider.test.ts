import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQueryEmbeddingForIndex, createEmbeddingProvider } from "../src/embeddingProvider.js";
import { RepoIndex } from "../src/types.js";

function makeEmbeddingIndex(provider: "local-hash-ngram" | "openai-compatible", dimension: number): RepoIndex {
  return {
    stats: {
      rootPath: "/repo",
      indexedAt: new Date().toISOString(),
      fileCount: 1,
      totalBytes: 100,
      totalLines: 10,
      languageBreakdown: { typescript: 1 },
      topCapabilities: { api: 1 },
      embeddings: {
        provider,
        dimension,
        embeddedFiles: 1
      }
    },
    files: new Map(),
    tfidfNorms: new Map(),
    inverseDocumentFrequency: new Map(),
    fileEmbeddings: new Map(),
    embeddingDimension: dimension,
    dependencyGraph: new Map(),
    reverseDependencyGraph: new Map(),
    pythonCallGraph: new Map()
  };
}

describe("embedding provider", () => {
  it("defaults to local provider", async () => {
    const provider = createEmbeddingProvider({});
    assert.equal(provider.name, "local-hash-ngram");
    const vectors = await provider.embedMany(["hello world"]);
    assert.equal(vectors.length, 1);
    assert.equal(vectors[0].length > 0, true);
  });

  it("falls back to local when remote config is incomplete", async () => {
    const provider = createEmbeddingProvider({
      CODE_DIGGER_EMBEDDING_PROVIDER: "remote",
      CODE_DIGGER_EMBEDDING_API_URL: "https://api.openai.com/v1/embeddings"
    });
    assert.equal(provider.name, "local-hash-ngram");
  });

  it("uses remote provider when fully configured", async () => {
    const fakeFetch: typeof fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ embedding: [1, 0] }, { embedding: [0, 1] }]
        })
      } as Response;
    }) as typeof fetch;

    const provider = createEmbeddingProvider(
      {
        CODE_DIGGER_EMBEDDING_PROVIDER: "remote",
        CODE_DIGGER_EMBEDDING_API_URL: "https://example.test/embeddings",
        CODE_DIGGER_EMBEDDING_API_KEY: "test-key",
        CODE_DIGGER_EMBEDDING_MODEL: "dummy-model",
        CODE_DIGGER_EMBEDDING_DIMENSION: "2",
        CODE_DIGGER_EMBEDDING_BATCH_SIZE: "16"
      },
      fakeFetch
    );
    assert.equal(provider.name, "openai-compatible");
    const vectors = await provider.embedMany(["alpha", "beta"]);
    assert.equal(vectors.length, 2);
    assert.equal(vectors[0].length, 2);
  });

  it("uses all-local fallback when any remote batch fails", async () => {
    let callCount = 0;
    const flakyFetch: typeof fetch = (async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ embedding: [1, 0] }]
          })
        } as Response;
      }
      throw new Error("network fail");
    }) as typeof fetch;

    const env = {
      CODE_DIGGER_EMBEDDING_PROVIDER: "remote",
      CODE_DIGGER_EMBEDDING_API_URL: "https://example.test/embeddings",
      CODE_DIGGER_EMBEDDING_API_KEY: "test-key",
      CODE_DIGGER_EMBEDDING_MODEL: "dummy-model",
      CODE_DIGGER_EMBEDDING_DIMENSION: "2",
      CODE_DIGGER_EMBEDDING_BATCH_SIZE: "1"
    };
    const remoteProvider = createEmbeddingProvider(env, flakyFetch);
    const localProvider = createEmbeddingProvider({ CODE_DIGGER_EMBEDDING_DIMENSION: "2" });
    const texts = ["alpha", "beta"];
    const remoteVectors = await remoteProvider.embedMany(texts);
    const localVectors = await localProvider.embedMany(texts);
    assert.deepEqual(remoteVectors, localVectors);
  });

  it("builds query embeddings only when provider matches index metadata", async () => {
    const remoteIndex = makeEmbeddingIndex("openai-compatible", 2);
    const noMatch = await buildQueryEmbeddingForIndex(
      remoteIndex,
      "alpha",
      { CODE_DIGGER_EMBEDDING_PROVIDER: "local" },
      (async () => {
        throw new Error("should not be called");
      }) as typeof fetch
    );
    assert.equal(noMatch, null);

    const fakeFetch: typeof fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ embedding: [1, 0] }]
        })
      } as Response;
    }) as typeof fetch;
    const yesMatch = await buildQueryEmbeddingForIndex(
      remoteIndex,
      "alpha",
      {
        CODE_DIGGER_EMBEDDING_PROVIDER: "remote",
        CODE_DIGGER_EMBEDDING_API_URL: "https://example.test/embeddings",
        CODE_DIGGER_EMBEDDING_API_KEY: "test-key",
        CODE_DIGGER_EMBEDDING_MODEL: "dummy-model",
        CODE_DIGGER_EMBEDDING_DIMENSION: "2"
      },
      fakeFetch
    );
    assert.ok(Array.isArray(yesMatch));
    assert.equal(yesMatch?.length, 2);
  });
});
