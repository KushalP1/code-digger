import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface PersistedGraphDb {
  version: "1";
  rootPath: string;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
  nodes: string[];
  forward: number[][];
  reverse: number[][];
}

export function graphDbPath(rootPath: string): string {
  return path.join(rootPath, ".code-digger", "graph-db.json");
}

function toCompactAdjacency(
  nodes: string[],
  graph: Map<string, Set<string>>,
  indexByPath: Map<string, number>
): number[][] {
  const adjacency: number[][] = new Array(nodes.length).fill(0).map(() => []);
  for (const [source, targets] of graph.entries()) {
    const sourceIdx = indexByPath.get(source);
    if (sourceIdx === undefined) {
      continue;
    }
    for (const target of targets) {
      const targetIdx = indexByPath.get(target);
      if (targetIdx !== undefined) {
        adjacency[sourceIdx].push(targetIdx);
      }
    }
  }
  return adjacency.map((row) => [...new Set(row)]);
}

export async function saveGraphDb(
  rootPath: string,
  forward: Map<string, Set<string>>,
  reverse: Map<string, Set<string>>
): Promise<{ filePath: string; nodeCount: number; edgeCount: number; sizeBytes: number }> {
  const nodes = [...new Set([...forward.keys(), ...reverse.keys()])].sort();
  const indexByPath = new Map<string, number>(nodes.map((node, idx) => [node, idx]));
  const compactForward = toCompactAdjacency(nodes, forward, indexByPath);
  const compactReverse = toCompactAdjacency(nodes, reverse, indexByPath);
  const edgeCount = compactForward.reduce((acc, row) => acc + row.length, 0);
  const payload: PersistedGraphDb = {
    version: "1",
    rootPath,
    updatedAt: new Date().toISOString(),
    nodeCount: nodes.length,
    edgeCount,
    nodes,
    forward: compactForward,
    reverse: compactReverse
  };

  const filePath = graphDbPath(rootPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(payload);
  await writeFile(filePath, serialized, "utf8");
  return {
    filePath,
    nodeCount: payload.nodeCount,
    edgeCount: payload.edgeCount,
    sizeBytes: Buffer.byteLength(serialized, "utf8")
  };
}

export async function loadGraphDb(rootPath: string): Promise<PersistedGraphDb | null> {
  try {
    const filePath = graphDbPath(rootPath);
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as PersistedGraphDb;
    if (parsed.version !== "1" || !Array.isArray(parsed.nodes)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function resolveNodeIndex(db: PersistedGraphDb, filePath: string): number | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const exact = db.nodes.findIndex((node) => node.replace(/\\/g, "/") === normalized);
  if (exact >= 0) {
    return exact;
  }
  const suffix = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const matches = db.nodes
    .map((node, idx) => ({ node: node.replace(/\\/g, "/"), idx }))
    .filter(({ node }) => node.endsWith(suffix))
    .map(({ idx }) => idx);
  if (matches.length === 1) {
    return matches[0];
  }
  return undefined;
}

function resolveNodeCandidates(db: PersistedGraphDb, filePath: string): number[] {
  const normalized = filePath.replace(/\\/g, "/");
  const exact = db.nodes
    .map((node, idx) => ({ node: node.replace(/\\/g, "/"), idx }))
    .filter(({ node }) => node === normalized)
    .map(({ idx }) => idx);
  if (exact.length > 0) {
    return exact.slice(0, 1);
  }
  const suffix = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return db.nodes
    .map((node, idx) => ({ node: node.replace(/\\/g, "/"), idx }))
    .filter(({ node }) => node.endsWith(suffix))
    .map(({ idx }) => idx);
}

function bfsFromAdjacency(
  adjacency: number[][],
  start: number,
  opts: { depth: number; maxNodes: number }
): number[] {
  const visited = new Set<number>();
  const queue: Array<{ node: number; depth: number }> = [{ node: start, depth: 0 }];
  while (queue.length > 0 && visited.size < opts.maxNodes) {
    const item = queue.shift();
    if (!item) {
      continue;
    }
    if (item.depth > opts.depth) {
      continue;
    }
    if (visited.has(item.node)) {
      continue;
    }
    visited.add(item.node);
    if (item.depth === opts.depth) {
      continue;
    }
    for (const next of adjacency[item.node] ?? []) {
      if (!visited.has(next)) {
        queue.push({ node: next, depth: item.depth + 1 });
      }
    }
  }
  return [...visited];
}

export function queryGraphDbNeighbors(
  db: PersistedGraphDb,
  filePath: string,
  opts: { direction: "forward" | "reverse" | "both"; depth: number; maxNodes: number }
): object {
  const candidates = resolveNodeCandidates(db, filePath);
  const index = resolveNodeIndex(db, filePath);
  if (candidates.length > 1 && index === undefined) {
    return {
      found: false,
      ambiguous: true,
      filePath,
      candidates: candidates.slice(0, 20).map((idx) => db.nodes[idx]),
      message: "Multiple graph nodes match this suffix. Use a more specific file path."
    };
  }
  if (index === undefined) {
    return {
      found: false,
      ambiguous: false,
      filePath,
      message: "File not found in persisted graph database."
    };
  }

  const resolvedFile = db.nodes[index];
  const forwardDirect = (db.forward[index] ?? []).map((idx) => db.nodes[idx]);
  const reverseDirect = (db.reverse[index] ?? []).map((idx) => db.nodes[idx]);

  const forwardTraversal =
    opts.direction === "forward" || opts.direction === "both"
      ? bfsFromAdjacency(db.forward, index, { depth: opts.depth, maxNodes: opts.maxNodes })
          .map((idx) => db.nodes[idx])
          .filter((node) => node !== resolvedFile)
      : [];
  const reverseTraversal =
    opts.direction === "reverse" || opts.direction === "both"
      ? bfsFromAdjacency(db.reverse, index, { depth: opts.depth, maxNodes: opts.maxNodes })
          .map((idx) => db.nodes[idx])
          .filter((node) => node !== resolvedFile)
      : [];

  return {
    found: true,
    filePath: resolvedFile,
    direction: opts.direction,
    direct: {
      forward: forwardDirect.slice(0, 200),
      reverse: reverseDirect.slice(0, 200)
    },
    traversal: {
      forward: forwardTraversal.slice(0, opts.maxNodes),
      reverse: reverseTraversal.slice(0, opts.maxNodes)
    }
  };
}

export async function graphDbStatus(rootPath: string): Promise<object> {
  const filePath = graphDbPath(rootPath);
  const db = await loadGraphDb(rootPath);
  if (!db) {
    return {
      exists: false,
      filePath,
      message: "No persisted graph database found. Run ingest_repo to create one."
    };
  }
  const fileInfo = await stat(filePath);
  return {
    exists: true,
    filePath,
    version: db.version,
    updatedAt: db.updatedAt,
    nodeCount: db.nodeCount,
    edgeCount: db.edgeCount,
    sizeBytes: fileInfo.size
  };
}
