import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RepoIndex } from "./types.js";

const execFileAsync = promisify(execFile);

function bfsReachable(
  graph: Map<string, Set<string>>,
  starts: string[],
  opts: { maxDepth: number; maxNodes: number }
): string[] {
  const visited = new Set<string>();
  const queue: Array<{ node: string; depth: number }> = starts.map((start) => ({
    node: start,
    depth: 0
  }));

  while (queue.length > 0 && visited.size < opts.maxNodes) {
    const item = queue.shift();
    if (!item) {
      continue;
    }
    if (item.depth > opts.maxDepth) {
      continue;
    }
    if (visited.has(item.node)) {
      continue;
    }
    visited.add(item.node);
    if (item.depth === opts.maxDepth) {
      continue;
    }
    const neighbors = graph.get(item.node) ?? new Set<string>();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push({ node: neighbor, depth: item.depth + 1 });
      }
    }
  }

  return [...visited];
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function resolveChangedFile(index: RepoIndex, changedPath: string): string | undefined {
  const normalized = normalizePath(changedPath);
  const exact = [...index.files.keys()].find((path) => normalizePath(path) === normalized);
  if (exact) {
    return exact;
  }
  return [...index.files.keys()].find((path) => normalizePath(path).endsWith(`/${normalized}`));
}

function buildChecklist(
  riskScore: number,
  changedFiles: string[],
  hotspotsTouched: string[],
  domainsTouched: string[]
): string[] {
  const checklist: string[] = [];
  if (riskScore >= 80) {
    checklist.push("Run full integration tests across all directly impacted modules.");
    checklist.push("Prepare staged rollout with rollback trigger and owner approvals.");
  } else if (riskScore >= 35) {
    checklist.push("Run focused integration tests for directly impacted modules.");
    checklist.push("Validate contracts for all high-fanout dependencies.");
  } else {
    checklist.push("Run targeted unit + smoke tests on changed modules.");
  }
  if (hotspotsTouched.length > 0) {
    checklist.push(`Review hotspots explicitly: ${hotspotsTouched.slice(0, 5).join(", ")}`);
  }
  if (domainsTouched.length > 1) {
    checklist.push("Cross-domain change: request at least one reviewer per touched domain.");
  }
  checklist.push(`Confirm behavior for changed files: ${changedFiles.slice(0, 6).join(", ")}`);
  return checklist;
}

function buildMermaid(
  index: RepoIndex,
  changedResolved: string[],
  transitiveDependents: string[],
  transitiveDependencies: string[]
): string {
  const selected = new Set<string>(changedResolved);
  for (const file of transitiveDependents.slice(0, 8)) {
    selected.add(file);
  }
  for (const file of transitiveDependencies.slice(0, 8)) {
    selected.add(file);
  }

  const lines = ["graph TD"];
  const ids = new Map<string, string>();
  let counter = 1;
  for (const node of selected) {
    ids.set(node, `N${counter}`);
    const label = normalizePath(node).split("/").slice(-2).join("/");
    lines.push(`  N${counter}["${label}"]`);
    counter += 1;
  }

  for (const source of selected) {
    const sourceId = ids.get(source);
    if (!sourceId) {
      continue;
    }
    const deps = index.dependencyGraph.get(source) ?? new Set<string>();
    for (const dep of deps) {
      if (!selected.has(dep)) {
        continue;
      }
      const depId = ids.get(dep);
      if (depId) {
        lines.push(`  ${sourceId} --> ${depId}`);
      }
    }
  }

  return lines.join("\n");
}

export function analyzePrImpact(
  index: RepoIndex,
  changedPaths: string[],
  opts: { transitiveDepth?: number; maxNodes?: number } = {}
): object {
  const transitiveDepth = Math.max(1, Math.min(4, opts.transitiveDepth ?? 3));
  const maxNodes = Math.max(50, Math.min(800, opts.maxNodes ?? 350));
  const changedResolved = changedPaths
    .map((path) => resolveChangedFile(index, path))
    .filter((value): value is string => Boolean(value));
  const changedSet = new Set(changedResolved);

  const directDependencies = new Set<string>();
  const directDependents = new Set<string>();
  for (const file of changedResolved) {
    for (const dep of index.dependencyGraph.get(file) ?? new Set<string>()) {
      directDependencies.add(dep);
    }
    for (const user of index.reverseDependencyGraph.get(file) ?? new Set<string>()) {
      directDependents.add(user);
    }
  }

  const transitiveDependents = bfsReachable(index.reverseDependencyGraph, changedResolved, {
    maxDepth: transitiveDepth,
    maxNodes
  }).filter((item) => !changedSet.has(item));
  const transitiveDependencies = bfsReachable(index.dependencyGraph, changedResolved, {
    maxDepth: transitiveDepth,
    maxNodes
  }).filter((item) => !changedSet.has(item));

  const domainsTouched = [
    ...new Set(
      changedResolved.flatMap((path) => {
        return index.files.get(path)?.capabilityTags ?? [];
      })
    )
  ];

  const fanIn = [...index.reverseDependencyGraph.entries()].map(([file, users]) => ({
    file,
    fanIn: users.size
  }));
  fanIn.sort((a, b) => b.fanIn - a.fanIn);
  const hotspotSet = new Set(fanIn.slice(0, 20).map((entry) => entry.file));
  const hotspotsTouched = changedResolved.filter((file) => hotspotSet.has(file));

  const riskScore =
    changedResolved.length * 4 +
    directDependencies.size +
    directDependents.size * 2 +
    transitiveDependencies.length +
    transitiveDependents.length * 2 +
    hotspotsTouched.length * 12 +
    Math.max(0, domainsTouched.length - 1) * 5;

  const riskLevel = riskScore >= 80 ? "high" : riskScore >= 35 ? "moderate" : "low";
  const mermaid = buildMermaid(index, changedResolved, transitiveDependents, transitiveDependencies);
  const checklist = buildChecklist(riskScore, changedPaths, hotspotsTouched, domainsTouched);
  const unresolvedChangedFiles = changedPaths.filter((path) => !resolveChangedFile(index, path));

  const summary =
    changedResolved.length === 0
      ? "No changed files from the PR matched the current in-memory index."
      : `PR touches ${changedResolved.length} indexed files across ${domainsTouched.length || 1} domains with ${riskLevel} architectural risk.`;

  return {
    summary,
    changedFiles: changedPaths,
    mappedChangedFiles: changedResolved,
    unresolvedChangedFiles,
    domainsTouched,
    impact: {
      directDependencies: [...directDependencies].slice(0, 200),
      directDependents: [...directDependents].slice(0, 200),
      transitiveDependencies: transitiveDependencies.slice(0, 300),
      transitiveDependents: transitiveDependents.slice(0, 300),
      hotspotsTouched
    },
    riskScore,
    riskLevel,
    reviewChecklist: checklist,
    diagram: {
      type: "mermaid",
      mermaid
    }
  };
}

async function listChangedFilesFromGit(
  repoPath: string,
  baseRef: string,
  headRef: string
): Promise<string[]> {
  const primaryRange = `${baseRef}...${headRef}`;
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "diff", "--name-only", primaryRange]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    const fallbackRange = `${baseRef}..${headRef}`;
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "diff", "--name-only", fallbackRange]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
}

export async function reviewPrImpact(
  index: RepoIndex,
  opts: {
    repoPath: string;
    baseRef?: string;
    headRef?: string;
    maxFiles?: number;
    transitiveDepth?: number;
  }
): Promise<object> {
  const baseRef = opts.baseRef ?? "main";
  const headRef = opts.headRef ?? "HEAD";
  const maxFiles = Math.max(1, Math.min(1000, opts.maxFiles ?? 200));
  const changed = await listChangedFilesFromGit(opts.repoPath, baseRef, headRef);
  const selected = changed.slice(0, maxFiles);
  const analysis = analyzePrImpact(index, selected, {
    transitiveDepth: opts.transitiveDepth ?? 3,
    maxNodes: 400
  });
  return {
    refs: { baseRef, headRef },
    changedFileCount: changed.length,
    analyzedFileCount: selected.length,
    ...analysis
  };
}

export function reviewPrImpactFromFiles(
  index: RepoIndex,
  opts: {
    changedFiles: string[];
    transitiveDepth?: number;
    maxFiles?: number;
  }
): object {
  const maxFiles = Math.max(1, Math.min(1000, opts.maxFiles ?? 300));
  const selected = opts.changedFiles.slice(0, maxFiles);
  return {
    changedFileCount: opts.changedFiles.length,
    analyzedFileCount: selected.length,
    source: "explicit_changed_files",
    ...analyzePrImpact(index, selected, {
      transitiveDepth: opts.transitiveDepth ?? 3,
      maxNodes: 450
    })
  };
}
