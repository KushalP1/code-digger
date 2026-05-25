export const DEFAULT_EMBEDDING_DIMENSION = 192;

function positiveHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizedTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function charNgrams(token: string): string[] {
  const grams: string[] = [];
  for (let n = 3; n <= 5; n += 1) {
    if (token.length < n) {
      continue;
    }
    for (let i = 0; i <= token.length - n; i += 1) {
      grams.push(token.slice(i, i + n));
    }
  }
  return grams;
}

export function embedText(text: string, dimension = DEFAULT_EMBEDDING_DIMENSION): number[] {
  const vec = new Array<number>(dimension).fill(0);
  const tokens = normalizedTokens(text);
  for (const token of tokens) {
    const tokenIdx = positiveHash(`tok:${token}`) % dimension;
    const tokenSign = positiveHash(`sgn:${token}`) % 2 === 0 ? 1 : -1;
    vec[tokenIdx] += tokenSign * 1.5;

    const grams = charNgrams(token);
    for (const gram of grams) {
      const gramIdx = positiveHash(`gram:${gram}`) % dimension;
      const gramSign = positiveHash(`sgn:${gram}`) % 2 === 0 ? 1 : -1;
      vec[gramIdx] += gramSign;
    }
  }

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

export function cosineSimilarityDense(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  if (aNorm === 0 || bNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}
