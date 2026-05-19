import path from "node:path";
import { FileInfo } from "./types.js";

function fileCandidatesFromImportTarget(rawTarget: string): string[] {
  return [
    rawTarget,
    `${rawTarget}.ts`,
    `${rawTarget}.tsx`,
    `${rawTarget}.js`,
    `${rawTarget}.jsx`,
    `${rawTarget}.mjs`,
    `${rawTarget}.cjs`,
    `${rawTarget}.py`,
    `${rawTarget}.go`,
    `${rawTarget}.java`,
    `${rawTarget}.kt`,
    `${rawTarget}.rs`,
    path.join(rawTarget, "index.ts"),
    path.join(rawTarget, "index.tsx"),
    path.join(rawTarget, "index.js"),
    path.join(rawTarget, "index.jsx"),
    path.join(rawTarget, "index.mjs"),
    path.join(rawTarget, "index.cjs"),
    path.join(rawTarget, "__init__.py")
  ];
}

function toPathSegments(filePath: string): string[] {
  return filePath.split(path.sep).filter(Boolean);
}

function deriveModuleAliases(filePath: string): string[] {
  const parsed = path.parse(filePath);
  const noExt = path.join(parsed.dir, parsed.name);
  const normalizedNoExt = noExt.replace(/\\/g, "/");
  const trimmed =
    normalizedNoExt.endsWith("/index") || normalizedNoExt.endsWith("/__init__")
      ? normalizedNoExt.replace(/\/(?:index|__init__)$/, "")
      : normalizedNoExt;
  const segments = trimmed.split("/").filter(Boolean);
  const aliases = new Set<string>();

  for (let i = 0; i < segments.length; i += 1) {
    const tail = segments.slice(i);
    aliases.add(tail.join("."));
    aliases.add(tail.join("/"));
  }
  return [...aliases];
}

function buildModuleLookup(files: Map<string, FileInfo>): Map<string, Set<string>> {
  const lookup = new Map<string, Set<string>>();
  for (const filePath of files.keys()) {
    for (const alias of deriveModuleAliases(filePath)) {
      const existing = lookup.get(alias) ?? new Set<string>();
      existing.add(filePath);
      lookup.set(alias, existing);
    }
  }
  return lookup;
}

function pickBestCandidate(importerPath: string, candidates: Set<string>): string | undefined {
  let best: string | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  const importerSegments = toPathSegments(path.dirname(importerPath));

  for (const candidate of candidates) {
    const candidateSegments = toPathSegments(path.dirname(candidate));
    let sharedPrefix = 0;
    const maxPrefix = Math.min(importerSegments.length, candidateSegments.length);
    while (
      sharedPrefix < maxPrefix &&
      importerSegments[sharedPrefix] === candidateSegments[sharedPrefix]
    ) {
      sharedPrefix += 1;
    }

    const distancePenalty = Math.abs(importerSegments.length - candidateSegments.length);
    const score = sharedPrefix * 10 - distancePenalty;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

export function resolveInternalDependency(
  importerPath: string,
  importText: string,
  knownFiles: Set<string>,
  moduleLookup: Map<string, Set<string>>
): string | undefined {
  const normalizedImport = importText.trim();

  if (normalizedImport.startsWith(".") || normalizedImport.startsWith("/")) {
    const importerDir = path.dirname(importerPath);
    const rawTarget = normalizedImport.startsWith("/")
      ? normalizedImport
      : path.resolve(importerDir, normalizedImport);

    for (const candidate of fileCandidatesFromImportTarget(rawTarget)) {
      if (knownFiles.has(candidate)) {
        return candidate;
      }
    }
  }

  const moduleCandidates = new Set<string>();
  const normalizedDot = normalizedImport.replace(/\//g, ".");
  const normalizedSlash = normalizedImport.replace(/\./g, "/");
  for (const key of [normalizedImport, normalizedDot, normalizedSlash]) {
    const hits = moduleLookup.get(key);
    if (!hits) {
      continue;
    }
    for (const hit of hits) {
      moduleCandidates.add(hit);
    }
  }

  if (moduleCandidates.size > 0) {
    return pickBestCandidate(importerPath, moduleCandidates);
  }

  return undefined;
}

export function buildDependencyGraph(files: Map<string, FileInfo>): {
  forward: Map<string, Set<string>>;
  reverse: Map<string, Set<string>>;
} {
  const forward = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();
  const knownPaths = new Set(files.keys());
  const moduleLookup = buildModuleLookup(files);

  for (const [filePath, fileInfo] of files.entries()) {
    const dependencies = new Set<string>();
    for (const importText of fileInfo.imports) {
      const resolved = resolveInternalDependency(filePath, importText, knownPaths, moduleLookup);
      if (resolved) {
        dependencies.add(resolved);
      }
    }
    forward.set(filePath, dependencies);
  }

  for (const [source, targets] of forward.entries()) {
    for (const target of targets) {
      const existing = reverse.get(target) ?? new Set<string>();
      existing.add(source);
      reverse.set(target, existing);
    }
  }

  return { forward, reverse };
}

export function compressArchitecture(files: Map<string, FileInfo>): Array<{
  domain: string;
  files: number;
  topSymbols: string[];
}> {
  const domains = new Map<string, { files: number; symbols: string[] }>();

  for (const file of files.values()) {
    const tags = file.capabilityTags.length > 0 ? file.capabilityTags : ["uncategorized"];
    for (const tag of tags) {
      const entry = domains.get(tag) ?? { files: 0, symbols: [] };
      entry.files += 1;
      entry.symbols.push(...file.symbols.slice(0, 2).map((s) => s.name));
      domains.set(tag, entry);
    }
  }

  return [...domains.entries()]
    .map(([domain, data]) => ({
      domain,
      files: data.files,
      topSymbols: [...new Set(data.symbols)].slice(0, 8)
    }))
    .sort((a, b) => b.files - a.files);
}
