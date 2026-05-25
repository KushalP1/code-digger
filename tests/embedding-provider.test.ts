import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmbeddingProvider } from "../src/embeddingProvider.js";

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
});
