import { compressArchitecture } from "./architecture.js";
import { cosineSimilarityDense, embedText } from "./embeddings.js";
import { cosineSimilarity, termFrequency, tokenize } from "./semantic.js";
import { AskResponse, RepoIndex } from "./types.js";

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

function shortestPath(
  graph: Map<string, Set<string>>,
  start: string,
  target: string,
  maxDepth = 8
): string[] {
  if (start === target) {
    return [start];
  }
  const queue: Array<{ node: string; path: string[]; depth: number }> = [
    { node: start, path: [start], depth: 0 }
  ];
  const visited = new Set<string>([start]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (current.depth >= maxDepth) {
      continue;
    }
    const neighbors = graph.get(current.node) ?? new Set<string>();
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) {
        continue;
      }
      const nextPath = [...current.path, neighbor];
      if (neighbor === target) {
        return nextPath;
      }
      visited.add(neighbor);
      queue.push({ node: neighbor, path: nextPath, depth: current.depth + 1 });
    }
  }

  return [];
}

function buildBidirectionalGraph(index: RepoIndex): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const ensure = (node: string) => {
    const existing = graph.get(node) ?? new Set<string>();
    graph.set(node, existing);
    return existing;
  };

  for (const [src, deps] of index.dependencyGraph.entries()) {
    const srcSet = ensure(src);
    for (const dep of deps) {
      srcSet.add(dep);
      ensure(dep).add(src);
    }
  }

  return graph;
}

function fileNameStem(filePath: string): string {
  const unix = filePath.replace(/\\/g, "/");
  const parts = unix.split("/");
  const last = parts[parts.length - 1] ?? "";
  return last.replace(/\.[^/.]+$/, "");
}

function stitchPaths(paths: string[][]): string[] {
  const canonical: string[] = [];
  for (const path of paths) {
    if (path.length === 0) {
      continue;
    }
    if (canonical.length === 0) {
      canonical.push(...path);
      continue;
    }
    const tail = canonical[canonical.length - 1];
    if (tail === path[0]) {
      canonical.push(...path.slice(1));
      continue;
    }
    const overlapIndex = canonical.indexOf(path[0]);
    if (overlapIndex >= 0) {
      canonical.splice(overlapIndex + 1);
      canonical.push(...path.slice(1));
      continue;
    }
    canonical.push(...path);
  }
  return [...new Set(canonical)];
}

function orderedUniqueFeatureTokens(feature: string): string[] {
  const genericFlowTerms = new Set([
    "flow",
    "flows",
    "feature",
    "path",
    "journey",
    "pipeline",
    "module",
    "system"
  ]);
  const raw = feature
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !genericFlowTerms.has(token));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const token of raw) {
    if (!seen.has(token)) {
      seen.add(token);
      ordered.push(token);
    }
  }
  return ordered;
}

export function askCodebase(
  index: RepoIndex,
  question: string,
  topK = 8,
  opts: { queryEmbedding?: number[] | null } = {}
): AskResponse {
  const queryTf = termFrequency(tokenize(question));
  const providerName = index.stats.embeddings?.provider ?? "local-hash-ngram";
  const localProviderActive = providerName !== "openai-compatible";
  const queryEmbedding =
    opts.queryEmbedding !== undefined
      ? opts.queryEmbedding
      : localProviderActive
        ? embedText(question, index.embeddingDimension)
        : null;
  const scores: Array<{ path: string; score: number }> = [];

  for (const [filePath, file] of index.files.entries()) {
    const lexicalScore = cosineSimilarity(
      queryTf,
      file.tokens,
      index.inverseDocumentFrequency,
      index.tfidfNorms.get(filePath) ?? 0
    );
    const embeddingScore =
      queryEmbedding && queryEmbedding.length === index.embeddingDimension
        ? cosineSimilarityDense(queryEmbedding, index.fileEmbeddings.get(filePath) ?? [])
        : 0;
    const blendedScore =
      lexicalScore > 0
        ? lexicalScore * 0.65 + Math.max(0, embeddingScore) * 0.35
        : Math.max(0, embeddingScore) * 0.5;
    if (blendedScore > 0.01) {
      scores.push({ path: filePath, score: blendedScore });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores.slice(0, topK);
  const topFiles = best.map((item) => {
    const file = index.files.get(item.path);
    if (!file) {
      return {
        path: item.path,
        score: item.score,
        summary: "No summary available.",
        capabilityTags: [] as string[]
      };
    }
    return {
      path: item.path,
      score: Number(item.score.toFixed(5)),
      summary: file.summary,
      capabilityTags: file.capabilityTags
    };
  });

  const primary = topFiles[0]?.path;
  const directlyUses = primary
    ? [...(index.dependencyGraph.get(primary) ?? new Set<string>())].slice(0, 12)
    : [];
  const directlyUsedBy = primary
    ? [...(index.reverseDependencyGraph.get(primary) ?? new Set<string>())].slice(0, 12)
    : [];
  const primaryPythonCalls = primary
    ? [...index.pythonCallGraph.entries()]
        .filter(([key]) => key.startsWith(`${primary}:`))
        .slice(0, 10)
        .map(([from, calls]) => ({
          from,
          calls: [...calls].slice(0, 12)
        }))
    : [];

  const compressed = compressArchitecture(index.files).slice(0, 5);
  const architectureHint = compressed
    .map((entry) => `${entry.domain}(${entry.files})`)
    .join(", ");

  const answer = topFiles.length
    ? `Most relevant area appears to be ${topFiles[0].path}. The question intersects domains: ${architectureHint}. Start from top files and walk dependencies using directlyUses/directlyUsedBy.`
    : "No matching files were found in the current index. Re-index with a broader extension set or refine the question with domain terms.";

  return {
    answer,
    topFiles,
    architectureContext: {
      directlyUsedBy,
      directlyUses,
      primaryPythonCalls
    }
  };
}

export function summarizeScope(index: RepoIndex, scopePath?: string): object {
  if (!scopePath) {
    return {
      level: "repo",
      stats: index.stats,
      architecture: compressArchitecture(index.files).slice(0, 12)
    };
  }

  const files = [...index.files.values()].filter((file) => file.path.includes(scopePath));
  const languageBreakdown: Record<string, number> = {};
  const capabilities: Record<string, number> = {};
  for (const file of files) {
    languageBreakdown[file.language] = (languageBreakdown[file.language] ?? 0) + 1;
    for (const cap of file.capabilityTags) {
      capabilities[cap] = (capabilities[cap] ?? 0) + 1;
    }
  }

  return {
    level: files.length === 1 ? "file" : "folder",
    scopePath,
    fileCount: files.length,
    languageBreakdown,
    capabilities,
    files: files.slice(0, 20).map((file) => ({
      path: file.path,
      summary: file.summary,
      symbols: file.symbols.slice(0, 10)
    }))
  };
}

export function traceFeature(
  index: RepoIndex,
  feature: string,
  opts: { queryEmbedding?: number[] | null } = {}
): object {
  const result = askCodebase(index, feature, 20, { queryEmbedding: opts.queryEmbedding });
  const seedPaths = result.topFiles.slice(0, 12).map((file) => file.path);
  const weighted = new Map<string, number>();
  const featureTokens = tokenize(feature);
  const anchorCandidates = [...index.files.values()]
    .map((file) => {
      const stem = fileNameStem(file.path).toLowerCase();
      const score = featureTokens.reduce((acc, token) => {
        if (token.length < 3) {
          return acc;
        }
        return acc + (stem.includes(token) ? 1 : 0);
      }, 0);
      return { path: file.path, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((entry) => entry.path);
  const stemByPath = new Map<string, string>();
  for (const file of index.files.values()) {
    stemByPath.set(file.path, fileNameStem(file.path).toLowerCase());
  }

  for (let i = 0; i < seedPaths.length; i += 1) {
    weighted.set(seedPaths[i], 100 - i);
  }

  for (const seed of seedPaths) {
    const downstream = bfsReachable(index.dependencyGraph, [seed], { maxDepth: 2, maxNodes: 80 });
    const upstream = bfsReachable(index.reverseDependencyGraph, [seed], {
      maxDepth: 2,
      maxNodes: 80
    });
    for (const path of [...downstream, ...upstream]) {
      const prior = weighted.get(path) ?? 0;
      weighted.set(path, prior + (path === seed ? 0 : 12));
    }
  }

  const pathGraph = buildBidirectionalGraph(index);
  const routeAnchors = [...new Set([...seedPaths.slice(0, 6), ...anchorCandidates])].slice(0, 10);
  const priorityFlow: Array<{ from: string; to: string; path: string[] }> = [];
  const bridgeNodes = new Set<string>();
  const orderedFlowSegments: string[][] = [];

  const orderedAnchors: string[] = [];
  for (const token of orderedUniqueFeatureTokens(feature)) {
    const best = [...index.files.keys()]
      .filter((candidate) => (stemByPath.get(candidate) ?? "").includes(token))
      .sort((a, b) => (weighted.get(b) ?? 0) - (weighted.get(a) ?? 0))[0];
    if (best && !orderedAnchors.includes(best)) {
      orderedAnchors.push(best);
    }
    if (orderedAnchors.length >= 6) {
      break;
    }
  }
  for (let i = 0; i + 1 < orderedAnchors.length; i += 1) {
    const from = orderedAnchors[i];
    const to = orderedAnchors[i + 1];
    const path = shortestPath(pathGraph, from, to, 8);
    if (path.length >= 2) {
      priorityFlow.push({ from, to, path });
      orderedFlowSegments.push(path);
      for (const node of path) {
        bridgeNodes.add(node);
        weighted.set(node, (weighted.get(node) ?? 0) + 50);
      }
    }
    if (priorityFlow.length >= 12) {
      break;
    }
  }

  for (let i = 0; i < routeAnchors.length; i += 1) {
    for (let j = i + 1; j < routeAnchors.length; j += 1) {
      const from = routeAnchors[i];
      const to = routeAnchors[j];
      const path = shortestPath(pathGraph, from, to, 7);
      if (path.length >= 2) {
        priorityFlow.push({ from, to, path });
        for (const node of path) {
          bridgeNodes.add(node);
          weighted.set(node, (weighted.get(node) ?? 0) + 18);
        }
      }
      if (priorityFlow.length >= 12) {
        break;
      }
    }
    if (priorityFlow.length >= 12) {
      break;
    }
  }

  const canonicalFlow =
    orderedFlowSegments.length > 0
      ? stitchPaths(orderedFlowSegments)
      : stitchPaths(
          priorityFlow
            .slice()
            .sort((a, b) => {
              const scoreA = a.path.reduce((acc, node) => acc + (weighted.get(node) ?? 0), 0);
              const scoreB = b.path.reduce((acc, node) => acc + (weighted.get(node) ?? 0), 0);
              return scoreB - scoreA;
            })
            .slice(0, 2)
            .map((entry) => entry.path)
        );

  const expandedPaths = [...weighted.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([filePath]) => filePath);

  const traces = expandedPaths.map((filePath) => {
    const file = index.files.get(filePath);
    return {
      file: filePath,
      summary: file?.summary ?? "No summary available.",
      upstream: [...(index.reverseDependencyGraph.get(filePath) ?? new Set<string>())].slice(0, 10),
      downstream: [...(index.dependencyGraph.get(filePath) ?? new Set<string>())].slice(0, 10),
      pythonCalls: [...index.pythonCallGraph.entries()]
        .filter(([key]) => key.startsWith(`${filePath}:`))
        .slice(0, 8)
        .map(([from, calls]) => ({
          from,
          calls: [...calls].slice(0, 10)
        }))
    };
  });

  const transitiveContext = seedPaths.length
    ? {
        transitiveDownstream: bfsReachable(index.dependencyGraph, seedPaths.slice(0, 4), {
          maxDepth: 3,
          maxNodes: 120
        }).slice(0, 40),
        transitiveUpstream: bfsReachable(index.reverseDependencyGraph, seedPaths.slice(0, 4), {
          maxDepth: 3,
          maxNodes: 120
        }).slice(0, 40)
      }
    : {
        transitiveDownstream: [],
        transitiveUpstream: []
      };

  return {
    feature,
    hypothesis: result.answer,
    seedFiles: seedPaths,
    prioritizedBridgeFiles: [...bridgeNodes].slice(0, 24),
    canonicalFlow: canonicalFlow.slice(0, 40),
    priorityFlow: priorityFlow.slice(0, 8),
    trace: traces,
    ...transitiveContext
  };
}

export function impactAnalysis(index: RepoIndex, filePath: string): object {
  const normalized = [...index.files.keys()].find((key) => key.endsWith(filePath)) ?? filePath;
  const directDependencies = [...(index.dependencyGraph.get(normalized) ?? new Set<string>())];
  const directDependents = [...(index.reverseDependencyGraph.get(normalized) ?? new Set<string>())];
  const transitiveDependencies = bfsReachable(index.dependencyGraph, [normalized], {
    maxDepth: 3,
    maxNodes: 300
  }).filter((node) => node !== normalized);
  const transitiveDependents = bfsReachable(index.reverseDependencyGraph, [normalized], {
    maxDepth: 3,
    maxNodes: 300
  }).filter((node) => node !== normalized);

  const lexicalDependents = [...index.files.values()]
    .filter((file) => file.path !== normalized)
    .filter((file) => {
      const importBlob = file.imports.join(" ");
      return importBlob.includes(pathStem(normalized));
    })
    .map((file) => file.path)
    .slice(0, 40);

  const lexicalDependencies = (index.files.get(normalized)?.imports ?? [])
    .map((importText) => {
      return [...index.files.keys()].find((candidate) => {
        return candidate.endsWith(`${importText.replace(/\./g, "/")}.py`);
      });
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 40);

  const dependencyCount = new Set([...directDependencies, ...transitiveDependencies]).size;
  const dependentCount = new Set([...directDependents, ...transitiveDependents]).size;
  const riskScore = dependentCount * 2 + dependencyCount;

  const recommendation =
    riskScore >= 80
      ? "High impact area. Use staged rollout, broader integration tests, and explicit rollback plan."
      : riskScore >= 25
        ? "Moderate impact. Validate direct contracts and run integration tests on dependent modules."
        : "Low impact. Validate local behavior and direct dependency contracts.";

  return {
    filePath: normalized,
    directDependents,
    directDependencies,
    transitiveDependents: transitiveDependents.slice(0, 120),
    transitiveDependencies: transitiveDependencies.slice(0, 120),
    unresolvedHintDependents: lexicalDependents,
    unresolvedHintDependencies: lexicalDependencies,
    riskScore,
    recommendation
  };
}

function pathStem(filePath: string): string {
  const unixPath = filePath.replace(/\\/g, "/");
  const noExt = unixPath.replace(/\.[^/.]+$/, "");
  return noExt.split("/").slice(-2).join("/");
}

export function learningPath(index: RepoIndex, role: "beginner" | "senior" | "architect"): object {
  const domains = compressArchitecture(index.files).slice(0, 8);
  const domainHints = domains.map((domain) => ({
    domain: domain.domain,
    readFirst: domain.topSymbols.slice(0, 4)
  }));

  const planByRole: Record<typeof role, string[]> = {
    beginner: [
      "Start with repository summary and critical flows.",
      "Read top domain files and endpoint handlers.",
      "Trace one user journey end-to-end using trace_feature tool."
    ],
    senior: [
      "Map domain boundaries and dependency hotspots.",
      "Inspect retry/failure handling and side effects.",
      "Run impact_analysis before touching high-fanout files."
    ],
    architect: [
      "Review architecture compression and hidden coupling.",
      "Evaluate domain separation and drift trends.",
      "Prioritize simplification and extraction opportunities."
    ]
  };

  return {
    role,
    plan: planByRole[role],
    suggestedDomains: domainHints
  };
}

export function pythonSymbolInsight(index: RepoIndex, symbol: string): object {
  const hits: Array<{
    file: string;
    classes: object[];
    functions: object[];
  }> = [];

  for (const file of index.files.values()) {
    if (!file.pythonAst) {
      continue;
    }

    const classes = file.pythonAst.classes
      .filter((klass) => klass.qualname.includes(symbol) || klass.name.includes(symbol))
      .map((klass) => ({
        name: klass.name,
        qualname: klass.qualname,
        line: klass.line,
        bases: klass.bases,
        decorators: klass.decorators
      }));

    const functions = file.pythonAst.functions
      .filter((fn) => fn.qualname.includes(symbol) || fn.name.includes(symbol))
      .map((fn) => ({
        name: fn.name,
        qualname: fn.qualname,
        line: fn.line,
        isAsync: fn.isAsync,
        decorators: fn.decorators,
        calls: fn.calls
      }));

    if (classes.length > 0 || functions.length > 0) {
      hits.push({
        file: file.path,
        classes,
        functions
      });
    }
  }

  return {
    symbol,
    matches: hits,
    totalFilesMatched: hits.length
  };
}

type OutputStyle = "compact" | "caveman";

function trimWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return text;
  }
  return `${words.slice(0, maxWords).join(" ")}...`;
}

function toCaveman(text: string): string {
  return text
    .replace(/\b(primarily|related|because|therefore|appears|likely|intersects|architecture)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function autoUnderstandCodebase(
  index: RepoIndex,
  opts: { tokenBudget?: number; style?: OutputStyle } = {}
): object {
  const tokenBudget = Math.max(120, Math.min(2000, opts.tokenBudget ?? 500));
  const style: OutputStyle = opts.style ?? "compact";
  const domains = compressArchitecture(index.files).slice(0, 8);

  const dependencyHeat = [...index.reverseDependencyGraph.entries()]
    .map(([file, users]) => ({ file, fanIn: users.size }))
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 10);

  const criticalFiles = dependencyHeat.map((entry) => {
    const file = index.files.get(entry.file);
    return {
      path: entry.file,
      fanIn: entry.fanIn,
      summary: trimWords(file?.summary ?? "No summary.", 16)
    };
  });

  const keyPythonFlows = [...index.pythonCallGraph.entries()].slice(0, 20).map(([from, calls]) => ({
    from,
    calls: [...calls].slice(0, 6)
  }));

  const rawOverview =
    `Repo has ${index.stats.fileCount} files and ${index.stats.totalLines} lines. ` +
    `Top domains: ${domains.map((d) => `${d.domain}:${d.files}`).join(", ")}. ` +
    `Start from highest fan-in files, then trace downstream dependencies.`;
  const overview = style === "caveman" ? toCaveman(rawOverview) : rawOverview;

  const executionPlanBase = [
    "Open top 3 fan-in files.",
    "Trace one user flow end-to-end with trace_feature.",
    "Run impact_analysis before edits.",
    "Capture decisions in team docs."
  ];
  const executionPlan =
    style === "caveman"
      ? executionPlanBase.map((step) => toCaveman(step))
      : executionPlanBase;

  return {
    mode: "auto-understanding",
    style,
    tokenBudget,
    overview: trimWords(overview, Math.floor(tokenBudget / 5)),
    domains: domains.map((domain) => ({
      domain: domain.domain,
      files: domain.files,
      topSymbols: domain.topSymbols.slice(0, 5)
    })),
    criticalFiles: criticalFiles.slice(0, style === "caveman" ? 6 : 10),
    keyPythonFlows: keyPythonFlows.slice(0, style === "caveman" ? 6 : 12),
    executionPlan
  };
}

export function architectureDiagram(
  index: RepoIndex,
  opts: { maxNodes?: number; style?: OutputStyle } = {}
): object {
  const maxNodes = Math.max(6, Math.min(30, opts.maxNodes ?? 14));
  const style: OutputStyle = opts.style ?? "compact";

  const rankedNodes = [...index.reverseDependencyGraph.entries()]
    .map(([file, users]) => ({ file, score: users.size }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxNodes);
  const selected = new Set(rankedNodes.map((node) => node.file));

  const nodeIds = new Map<string, string>();
  rankedNodes.forEach((node, idx) => {
    nodeIds.set(node.file, `N${idx + 1}`);
  });

  const lines: string[] = ["graph TD"];
  for (const node of rankedNodes) {
    const nodeId = nodeIds.get(node.file) ?? "NX";
    const short = node.file.split("/").slice(-2).join("/");
    lines.push(`  ${nodeId}["${short}"]`);
  }
  for (const node of rankedNodes) {
    const fromId = nodeIds.get(node.file);
    if (!fromId) {
      continue;
    }
    const deps = index.dependencyGraph.get(node.file) ?? new Set<string>();
    for (const dep of deps) {
      if (!selected.has(dep)) {
        continue;
      }
      const toId = nodeIds.get(dep);
      if (toId) {
        lines.push(`  ${fromId} --> ${toId}`);
      }
    }
  }

  const mermaid = lines.join("\n");
  const narrativeRaw =
    style === "caveman"
      ? "Big boxes. Arrow show depend. Top fan-in files first."
      : "Diagram prioritizes high fan-in files to reduce cognitive load and shows dependency arrows among the most central modules.";

  return {
    diagramType: "mermaid",
    mermaid,
    narrative: narrativeRaw,
    nodes: rankedNodes.length
  };
}
