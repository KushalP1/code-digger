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

function shortPath(value: string): string {
  const normalized = normalizePath(value);
  const parts = normalized.split("/");
  return parts.slice(-3).join("/");
}

interface PrImpactCoreReport {
  summary: string;
  changedFiles: string[];
  mappedChangedFiles: string[];
  unresolvedChangedFiles: string[];
  domainsTouched: string[];
  impact: {
    directDependencies: string[];
    directDependents: string[];
    transitiveDependencies: string[];
    transitiveDependents: string[];
    hotspotsTouched: string[];
    symbolLevelChanges: Array<{
      file: string;
      symbols: string[];
      hunkCount: number;
      addedLines: number;
      removedLines: number;
    }>;
  };
  riskScore: number;
  riskLevel: string;
  reviewChecklist: string[];
  diagram: {
    type: "mermaid";
    mermaid: string;
  };
}

type CommentStyle = "compact" | "full";

interface SymbolChangeHint {
  symbols: Set<string>;
  hunkCount: number;
  addedLines: number;
  removedLines: number;
}

type SymbolChangeMap = Map<string, SymbolChangeHint>;

function getSymbolHintForFile(symbolHints: SymbolChangeMap | undefined, filePath: string) {
  if (!symbolHints) {
    return undefined;
  }
  const normalizedFile = normalizePath(filePath);
  const direct = symbolHints.get(normalizedFile) ?? symbolHints.get(filePath);
  if (direct) {
    return direct;
  }
  const suffix = normalizedFile.split("/").slice(-3).join("/");
  for (const [key, value] of symbolHints.entries()) {
    const normalizedKey = normalizePath(key);
    if (
      normalizedFile.endsWith(`/${normalizedKey}`) ||
      normalizedKey.endsWith(`/${suffix}`) ||
      normalizedKey === suffix
    ) {
      return value;
    }
  }
  return undefined;
}

function extractSymbolNames(text: string): string[] {
  const patterns: RegExp[] = [
    /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/,
    /^\s*(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(/,
    /^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
    /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|:)/,
    /([A-Za-z_][A-Za-z0-9_]*)\s*\(/
  ];
  const hits = new Set<string>();
  for (const regex of patterns) {
    const match = text.match(regex);
    if (match?.[1] && match[1].length > 2) {
      hits.add(match[1]);
    }
  }
  return [...hits];
}

export function extractSymbolChangeHintsFromDiff(unifiedDiff: string): SymbolChangeMap {
  const hints = new Map<string, SymbolChangeHint>();
  const lines = unifiedDiff.split("\n");
  let currentFile: string | undefined;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      currentFile = match?.[2]?.trim();
      continue;
    }
    if (!currentFile) {
      continue;
    }

    const current = hints.get(currentFile) ?? {
      symbols: new Set<string>(),
      hunkCount: 0,
      addedLines: 0,
      removedLines: 0
    };

    if (line.startsWith("@@")) {
      current.hunkCount += 1;
      for (const symbol of extractSymbolNames(line)) {
        current.symbols.add(symbol);
      }
      hints.set(currentFile, current);
      continue;
    }

    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      current.addedLines += 1;
      for (const symbol of extractSymbolNames(line.slice(1))) {
        current.symbols.add(symbol);
      }
      hints.set(currentFile, current);
      continue;
    }
    if (line.startsWith("-")) {
      current.removedLines += 1;
      for (const symbol of extractSymbolNames(line.slice(1))) {
        current.symbols.add(symbol);
      }
      hints.set(currentFile, current);
    }
  }

  return hints;
}

export function toPrCommentMarkdown(
  report: PrImpactCoreReport,
  opts: { baseRef?: string; headRef?: string; source?: string; commentStyle?: CommentStyle } = {}
): string {
  const commentStyle: CommentStyle = opts.commentStyle ?? "full";
  const refsLine =
    opts.baseRef && opts.headRef ? `- **Refs:** \`${opts.baseRef}...${opts.headRef}\`` : undefined;
  const sourceLine = opts.source ? `- **Source:** \`${opts.source}\`` : undefined;
  if (commentStyle === "compact") {
    const compactLines = [
      "## PR Architecture Impact Review",
      "",
      `**Risk:** \`${report.riskLevel.toUpperCase()}\` (score: ${report.riskScore})`,
      report.summary,
      "",
      `- **Changed/Mapped/Unresolved:** ${report.changedFiles.length}/${report.mappedChangedFiles.length}/${report.unresolvedChangedFiles.length}`,
      `- **Domains:** ${report.domainsTouched.length ? report.domainsTouched.join(", ") : "uncategorized"}`,
      refsLine,
      sourceLine,
      "",
      "### Checklist",
      ...report.reviewChecklist.slice(0, 4).map((item) => `- [ ] ${item}`)
    ].filter((line): line is string => Boolean(line));
    return compactLines.join("\n");
  }

  const lines = [
    "## PR Architecture Impact Review",
    "",
    `**Risk:** \`${report.riskLevel.toUpperCase()}\` (score: ${report.riskScore})`,
    "",
    report.summary,
    "",
    "### Scope",
    `- **Changed files:** ${report.changedFiles.length}`,
    `- **Mapped files:** ${report.mappedChangedFiles.length}`,
    `- **Unresolved files:** ${report.unresolvedChangedFiles.length}`,
    `- **Domains touched:** ${report.domainsTouched.length ? report.domainsTouched.join(", ") : "uncategorized"}`,
    refsLine,
    sourceLine,
    "",
    "### Impact",
    `- **Direct dependents:** ${report.impact.directDependents.length}`,
    `- **Transitive dependents:** ${report.impact.transitiveDependents.length}`,
    `- **Direct dependencies:** ${report.impact.directDependencies.length}`,
    `- **Transitive dependencies:** ${report.impact.transitiveDependencies.length}`,
    "",
    "### Hotspots",
    ...(
      report.impact.hotspotsTouched.length > 0
        ? report.impact.hotspotsTouched.slice(0, 8).map((path) => `- \`${shortPath(path)}\``)
        : ["- None detected in top fan-in set."]
    ),
    "",
    "### Symbol-Level Changes",
    ...(
      report.impact.symbolLevelChanges.length > 0
        ? report.impact.symbolLevelChanges
            .slice(0, 8)
            .map((entry) => {
              const symbolPreview = entry.symbols.slice(0, 6).join(", ") || "no symbol hints";
              return `- \`${shortPath(entry.file)}\`: ${entry.hunkCount} hunks, +${entry.addedLines}/-${entry.removedLines}, symbols: ${symbolPreview}`;
            })
        : ["- No symbol-level diff hints available."]
    ),
    "",
    "### Review Checklist",
    ...report.reviewChecklist.slice(0, 8).map((item) => `- [ ] ${item}`),
    "",
    "### Impact Diagram",
    "```mermaid",
    report.diagram.mermaid,
    "```"
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
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
  opts: {
    transitiveDepth?: number;
    maxNodes?: number;
    symbolHints?: SymbolChangeMap;
    commentStyle?: CommentStyle;
  } = {}
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
  const symbolLevelChanges = changedResolved
    .map((file) => {
      const hint = getSymbolHintForFile(opts.symbolHints, file);
      if (!hint) {
        return undefined;
      }
      return {
        file,
        symbols: [...hint.symbols].slice(0, 20),
        hunkCount: hint.hunkCount,
        addedLines: hint.addedLines,
        removedLines: hint.removedLines
      };
    })
    .filter(
      (
        item
      ): item is {
        file: string;
        symbols: string[];
        hunkCount: number;
        addedLines: number;
        removedLines: number;
      } => Boolean(item)
    );

  const symbolRiskBoost = symbolLevelChanges.reduce((acc, entry) => {
    return (
      acc +
      Math.min(18, entry.symbols.length * 2) +
      Math.min(20, entry.hunkCount * 2) +
      Math.min(12, Math.floor((entry.addedLines + entry.removedLines) / 25))
    );
  }, 0);

  const riskScore =
    changedResolved.length * 4 +
    directDependencies.size +
    directDependents.size * 2 +
    transitiveDependencies.length +
    transitiveDependents.length * 2 +
    hotspotsTouched.length * 12 +
    symbolRiskBoost +
    Math.max(0, domainsTouched.length - 1) * 5;

  const riskLevel = riskScore >= 80 ? "high" : riskScore >= 35 ? "moderate" : "low";
  const mermaid = buildMermaid(index, changedResolved, transitiveDependents, transitiveDependencies);
  const checklist = buildChecklist(riskScore, changedPaths, hotspotsTouched, domainsTouched);
  if (symbolLevelChanges.length > 0) {
    const top = symbolLevelChanges[0];
    checklist.unshift(
      `Review symbol-level changes around ${shortPath(top.file)} (${top.symbols.slice(0, 4).join(", ")}).`
    );
  }
  const unresolvedChangedFiles = changedPaths.filter((path) => !resolveChangedFile(index, path));

  const summary =
    changedResolved.length === 0
      ? "No changed files from the PR matched the current in-memory index."
      : `PR touches ${changedResolved.length} indexed files across ${domainsTouched.length || 1} domains with ${riskLevel} architectural risk.`;

  const report: PrImpactCoreReport = {
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
      hotspotsTouched,
      symbolLevelChanges
    },
    riskScore,
    riskLevel,
    reviewChecklist: checklist,
    diagram: {
      type: "mermaid",
      mermaid
    }
  };
  return {
    ...report,
    prCommentMarkdown: toPrCommentMarkdown(report, { commentStyle: opts.commentStyle })
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

async function getUnifiedDiffFromGit(repoPath: string, baseRef: string, headRef: string): Promise<string> {
  const primaryRange = `${baseRef}...${headRef}`;
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      repoPath,
      "diff",
      "--unified=0",
      primaryRange
    ]);
    return stdout;
  } catch {
    const fallbackRange = `${baseRef}..${headRef}`;
    const { stdout } = await execFileAsync("git", [
      "-C",
      repoPath,
      "diff",
      "--unified=0",
      fallbackRange
    ]);
    return stdout;
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
    commentStyle?: CommentStyle;
  }
): Promise<object> {
  const baseRef = opts.baseRef ?? "main";
  const headRef = opts.headRef ?? "HEAD";
  const maxFiles = Math.max(1, Math.min(1000, opts.maxFiles ?? 200));
  const changed = await listChangedFilesFromGit(opts.repoPath, baseRef, headRef);
  const unifiedDiff = await getUnifiedDiffFromGit(opts.repoPath, baseRef, headRef);
  const symbolHints = extractSymbolChangeHintsFromDiff(unifiedDiff);
  const selected = changed.slice(0, maxFiles);
  const analysis = analyzePrImpact(index, selected, {
    transitiveDepth: opts.transitiveDepth ?? 3,
    maxNodes: 400,
    symbolHints,
    commentStyle: opts.commentStyle ?? "full"
  });
  const report = {
    refs: { baseRef, headRef },
    changedFileCount: changed.length,
    analyzedFileCount: selected.length,
    ...analysis
  };
  const analysisWithMarkdown = analysis as PrImpactCoreReport & { prCommentMarkdown?: string };
  return {
    ...report,
    prCommentMarkdown: toPrCommentMarkdown(analysisWithMarkdown, {
      baseRef,
      headRef,
      source: "git_diff",
      commentStyle: opts.commentStyle ?? "full"
    })
  };
}

export function reviewPrImpactFromFiles(
  index: RepoIndex,
  opts: {
    changedFiles: string[];
    transitiveDepth?: number;
    maxFiles?: number;
    unifiedDiff?: string;
    commentStyle?: CommentStyle;
  }
): object {
  const maxFiles = Math.max(1, Math.min(1000, opts.maxFiles ?? 300));
  const selected = opts.changedFiles.slice(0, maxFiles);
  const symbolHints = opts.unifiedDiff
    ? extractSymbolChangeHintsFromDiff(opts.unifiedDiff)
    : undefined;
  const analysis = analyzePrImpact(index, selected, {
    transitiveDepth: opts.transitiveDepth ?? 3,
    maxNodes: 450,
    symbolHints,
    commentStyle: opts.commentStyle ?? "full"
  }) as PrImpactCoreReport & { prCommentMarkdown?: string };
  return {
    changedFileCount: opts.changedFiles.length,
    analyzedFileCount: selected.length,
    source: "explicit_changed_files",
    ...analysis,
    prCommentMarkdown: toPrCommentMarkdown(analysis, {
      source: "explicit_changed_files",
      commentStyle: opts.commentStyle ?? "full"
    })
  };
}

async function ghExec(repoPath: string, args: string[], repo?: string): Promise<string> {
  const cmdArgs = [...(repo ? ["-R", repo] : []), ...args];
  const { stdout } = await execFileAsync("gh", cmdArgs, { cwd: repoPath });
  return stdout;
}

interface GithubPrView {
  number: number;
  title: string;
  baseRefName: string;
  headRefName: string;
  url: string;
  files: Array<{ path: string }>;
}

export async function reviewGithubPrImpact(
  index: RepoIndex,
  opts: {
    repoPath: string;
    prNumber: number;
    repo?: string;
    maxFiles?: number;
    transitiveDepth?: number;
    autoComment?: boolean;
    commentStyle?: CommentStyle;
  }
): Promise<object> {
  const prNumber = Math.max(1, Math.floor(opts.prNumber));
  const viewRaw = await ghExec(
    opts.repoPath,
    ["pr", "view", String(prNumber), "--json", "number,title,baseRefName,headRefName,url,files"],
    opts.repo
  );
  const view = JSON.parse(viewRaw) as GithubPrView;
  const changedFiles = (view.files ?? []).map((file) => file.path).filter(Boolean);
  const diffRaw = await ghExec(
    opts.repoPath,
    ["pr", "diff", String(prNumber), "--patch", "--color=never"],
    opts.repo
  );

  const analysis = reviewPrImpactFromFiles(index, {
    changedFiles,
    maxFiles: opts.maxFiles ?? 300,
    transitiveDepth: opts.transitiveDepth ?? 3,
    unifiedDiff: diffRaw,
    commentStyle: opts.commentStyle ?? "full"
  }) as { prCommentMarkdown?: string };

  let commentPosted = false;
  if (opts.autoComment) {
    const body = String(analysis.prCommentMarkdown ?? "").trim();
    if (body) {
      await ghExec(
        opts.repoPath,
        ["pr", "comment", String(prNumber), "--body", body],
        opts.repo
      );
      commentPosted = true;
    }
  }

  return {
    github: {
      prNumber: view.number,
      title: view.title,
      url: view.url,
      baseRef: view.baseRefName,
      headRef: view.headRefName
    },
    autoCommentRequested: Boolean(opts.autoComment),
    commentPosted,
    ...analysis
  };
}
