import { STOP_WORDS } from "./config.js";

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

export function termFrequency(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token, (map.get(token) ?? 0) + 1);
  }
  return map;
}

export function cosineSimilarity(
  queryTf: Map<string, number>,
  docTf: Map<string, number>,
  idf: Map<string, number>,
  docNorm: number
): number {
  let dot = 0;
  let queryNormSq = 0;

  for (const [term, queryWeightRaw] of queryTf.entries()) {
    const idfValue = idf.get(term) ?? 0;
    const queryWeight = queryWeightRaw * idfValue;
    queryNormSq += queryWeight * queryWeight;

    const docWeightRaw = docTf.get(term) ?? 0;
    const docWeight = docWeightRaw * idfValue;
    dot += queryWeight * docWeight;
  }

  const queryNorm = Math.sqrt(queryNormSq);
  if (queryNorm === 0 || docNorm === 0) {
    return 0;
  }
  return dot / (queryNorm * docNorm);
}

export function vectorNorm(tf: Map<string, number>, idf: Map<string, number>): number {
  let sum = 0;
  for (const [term, rawWeight] of tf.entries()) {
    const weight = rawWeight * (idf.get(term) ?? 0);
    sum += weight * weight;
  }
  return Math.sqrt(sum);
}
