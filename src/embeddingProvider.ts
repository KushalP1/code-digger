import {
  DEFAULT_EMBEDDING_DIMENSION,
  cosineSimilarityDense,
  embedText
} from "./embeddings.js";
import { RepoIndex } from "./types.js";

type EmbeddingProviderName = "local-hash-ngram" | "openai-compatible";

interface EmbeddingProvider {
  name: EmbeddingProviderName;
  dimension: number;
  embedMany(texts: string[]): Promise<number[][]>;
}

function normalizeDense(vec: number[]): number[] {
  let normSq = 0;
  for (const value of vec) {
    normSq += value * value;
  }
  const norm = Math.sqrt(normSq);
  if (norm === 0) {
    return vec;
  }
  return vec.map((value) => value / norm);
}

class LocalEmbeddingProvider implements EmbeddingProvider {
  public readonly name: EmbeddingProviderName = "local-hash-ngram";
  public readonly dimension: number;

  constructor(dimension = DEFAULT_EMBEDDING_DIMENSION) {
    this.dimension = dimension;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    return texts.map((text) => embedText(text, this.dimension));
  }
}

class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  public readonly name: EmbeddingProviderName = "openai-compatible";
  public readonly dimension: number;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly batchSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly fallback: LocalEmbeddingProvider;

  constructor(opts: {
    endpoint: string;
    apiKey: string;
    model: string;
    dimension: number;
    batchSize: number;
    fetchImpl: typeof fetch;
    fallback: LocalEmbeddingProvider;
  }) {
    this.endpoint = opts.endpoint;
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.dimension = opts.dimension;
    this.batchSize = opts.batchSize;
    this.fetchImpl = opts.fetchImpl;
    this.fallback = opts.fallback;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const vectors: number[][] = [];
    let remoteFailure = false;
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      try {
        const body = JSON.stringify({
          model: this.model,
          input: batch,
          dimensions: this.dimension
        });
        const res = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`
          },
          body
        });
        if (!res.ok) {
          throw new Error(`Embedding API failed with status ${res.status}`);
        }
        const json = (await res.json()) as {
          data?: Array<{ embedding?: number[] }>;
        };
        const batchVectors = (json.data ?? []).map((row) => normalizeDense(row.embedding ?? []));
        if (batchVectors.length !== batch.length || batchVectors.some((vec) => vec.length === 0)) {
          throw new Error("Embedding API returned malformed vectors.");
        }
        vectors.push(...batchVectors);
      } catch {
        remoteFailure = true;
        break;
      }
    }
    if (remoteFailure || vectors.length !== texts.length) {
      // Keep one consistent vector space: when remote fails, fall back for all texts.
      return this.fallback.embedMany(texts);
    }
    return vectors;
  }
}

function parseIntOrDefault(raw: string | undefined, defaultValue: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.floor(parsed);
}

export function createEmbeddingProvider(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): EmbeddingProvider {
  const localDimension = parseIntOrDefault(env.CODE_DIGGER_EMBEDDING_DIMENSION, DEFAULT_EMBEDDING_DIMENSION);
  const localFallback = new LocalEmbeddingProvider(localDimension);
  const providerRaw = String(env.CODE_DIGGER_EMBEDDING_PROVIDER ?? "local").toLowerCase();
  const wantRemote =
    providerRaw === "remote" ||
    providerRaw === "openai" ||
    providerRaw === "openai-compatible";

  if (!wantRemote) {
    return localFallback;
  }

  const endpoint = String(env.CODE_DIGGER_EMBEDDING_API_URL ?? "https://api.openai.com/v1/embeddings").trim();
  const apiKey = String(env.CODE_DIGGER_EMBEDDING_API_KEY ?? "").trim();
  const model = String(env.CODE_DIGGER_EMBEDDING_MODEL ?? "text-embedding-3-small").trim();
  const batchSize = parseIntOrDefault(env.CODE_DIGGER_EMBEDDING_BATCH_SIZE, 64);
  if (!apiKey || !endpoint || !model) {
    return localFallback;
  }

  return new OpenAiCompatibleEmbeddingProvider({
    endpoint,
    apiKey,
    model,
    dimension: localDimension,
    batchSize,
    fetchImpl,
    fallback: localFallback
  });
}

export function isEmbeddingProviderCompatible(indexDimension: number, candidate: number[]): boolean {
  return candidate.length > 0 && candidate.length === indexDimension && cosineSimilarityDense(candidate, candidate) > 0;
}

export async function buildQueryEmbeddingForIndex(
  index: RepoIndex,
  question: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<number[] | null> {
  const expectedProvider = index.stats.embeddings?.provider ?? "local-hash-ngram";
  const provider = createEmbeddingProvider(env, fetchImpl);
  if (provider.name !== expectedProvider || provider.dimension !== index.embeddingDimension) {
    return null;
  }
  const vectors = await provider.embedMany([question]);
  const candidate = vectors[0] ?? [];
  if (!isEmbeddingProviderCompatible(index.embeddingDimension, candidate)) {
    return null;
  }
  return candidate;
}
