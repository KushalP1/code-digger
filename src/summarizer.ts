import path from "node:path";
import { CAPABILITY_KEYWORDS } from "./config.js";
import { SymbolInfo } from "./types.js";

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".c": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".h": "c-header",
    ".hpp": "cpp-header",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".swift": "swift",
    ".scala": "scala",
    ".sql": "sql",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml"
  };
  return map[ext] ?? "text";
}

export function extractSymbols(source: string): SymbolInfo[] {
  const lines = source.split("\n");
  const symbols: SymbolInfo[] = [];

  const patterns: Array<{ kind: SymbolInfo["kind"]; regex: RegExp }> = [
    // Python / Ruby class definitions.
    { kind: "class", regex: /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/ },
    { kind: "interface", regex: /^\s*interface\s+([A-Za-z_][A-Za-z0-9_]*)/ },
    { kind: "type", regex: /^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)/ },
    // JavaScript / TypeScript function declarations.
    { kind: "function", regex: /^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/ },
    // Python function declarations.
    { kind: "function", regex: /^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/ },
    {
      kind: "function",
      regex: /^\s*(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(?.*\)?\s*=>/
    },
    { kind: "const", regex: /^\s*(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/ },
    { kind: "module", regex: /^\s*module\s+([A-Za-z_][A-Za-z0-9_]*)/ }
  ];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match?.[1]) {
        symbols.push({ name: match[1], kind: pattern.kind, line: i + 1 });
        break;
      }
    }
  }
  return symbols;
}

export function extractImports(source: string): string[] {
  const imports = new Set<string>();
  const lines = source.split("\n");
  for (const line of lines) {
    const tsImport = line.match(/^\s*import\s+.*from\s+["']([^"']+)["']/);
    const pyImport = line.match(/^\s*from\s+([A-Za-z0-9_\.]+)\s+import\s+/);
    const pySimple = line.match(/^\s*import\s+([A-Za-z0-9_\.]+)/);
    const cInclude = line.match(/^\s*#include\s+[<"]([^">]+)[">]/);
    const requireImport = line.match(/require\(["']([^"']+)["']\)/);
    const javaImport = line.match(/^\s*import\s+([A-Za-z0-9_\.]+);/);

    const resolved =
      tsImport?.[1] ??
      pyImport?.[1] ??
      pySimple?.[1] ??
      cInclude?.[1] ??
      requireImport?.[1] ??
      javaImport?.[1];

    if (resolved) {
      imports.add(resolved);
    }
  }
  return [...imports];
}

export function detectCapabilities(filePath: string, source: string): string[] {
  const text = `${filePath}\n${source}`.toLowerCase();
  const matches: string[] = [];

  for (const [capability, keywords] of Object.entries(CAPABILITY_KEYWORDS)) {
    if (keywords.some((word) => text.includes(word))) {
      matches.push(capability);
    }
  }
  return matches;
}

export function summarizeFile(
  language: string,
  symbols: SymbolInfo[],
  capabilities: string[],
  importsCount: number
): string {
  const symbolPreview =
    symbols.slice(0, 4).map((symbol) => symbol.name).join(", ") ||
    "no explicit exported symbols";
  const capabilityPreview = capabilities.join(", ") || "general infrastructure";
  return `This ${language} file is primarily related to ${capabilityPreview}. It exposes ${symbolPreview} and has ${importsCount} dependency references.`;
}
