import path from "node:path";
import { DEFAULT_INDEXING_CONFIG, IndexingConfig } from "./config.js";
import { buildDependencyGraph } from "./architecture.js";
import { walkCodeFiles, safeReadUtf8 } from "./fs.js";
import { saveGraphDb } from "./graphDb.js";
import { parsePythonAstForFiles, pythonAstToSymbols } from "./pythonAst.js";
import { termFrequency, tokenize, vectorNorm } from "./semantic.js";
import {
  detectCapabilities,
  detectLanguage,
  extractImports,
  extractSymbols,
  summarizeFile
} from "./summarizer.js";
import { FileInfo, PythonAstFile, RepoIndex } from "./types.js";

export class RepoIndexer {
  private index: RepoIndex | null = null;
  private readonly config: IndexingConfig;

  constructor(config: Partial<IndexingConfig> = {}) {
    this.config = {
      ...DEFAULT_INDEXING_CONFIG,
      ...config,
      ignoreDirs: config.ignoreDirs ?? DEFAULT_INDEXING_CONFIG.ignoreDirs,
      allowedExtensions: config.allowedExtensions ?? DEFAULT_INDEXING_CONFIG.allowedExtensions
    };
  }

  public getIndex(): RepoIndex | null {
    return this.index;
  }

  public async ingest(rootPath: string): Promise<RepoIndex> {
    const normalizedRoot = path.resolve(rootPath);
    const codeFiles = await walkCodeFiles(normalizedRoot, this.config);
    const fileMap = new Map<string, FileInfo>();
    const languageBreakdown: Record<string, number> = {};
    const topCapabilities: Record<string, number> = {};
    let totalBytes = 0;
    let totalLines = 0;
    const pythonFiles = codeFiles.filter((file) => file.endsWith(".py"));
    let pythonAstByFile = new Map<string, PythonAstFile>();
    try {
      pythonAstByFile = await parsePythonAstForFiles(pythonFiles);
    } catch {
      // Keep indexing functional even if python3 is missing.
      pythonAstByFile = new Map();
    }

    for (const filePath of codeFiles) {
      const content = await safeReadUtf8(filePath);
      if (!content.trim()) {
        continue;
      }

      const language = detectLanguage(filePath);
      const lineCount = content.split("\n").length;
      const sizeBytes = Buffer.byteLength(content, "utf8");
      const pythonAst = pythonAstByFile.get(filePath);
      const imports = pythonAst?.imports ?? extractImports(content);
      const symbols = pythonAst ? pythonAstToSymbols(pythonAst) : extractSymbols(content);
      const capabilities = detectCapabilities(filePath, content);
      const tokens = termFrequency(tokenize(`${filePath}\n${content}`));
      const summary = summarizeFile(language, symbols, capabilities, imports.length);

      fileMap.set(filePath, {
        path: filePath,
        language,
        sizeBytes,
        lineCount,
        imports,
        symbols,
        tokens,
        summary,
        capabilityTags: capabilities,
        pythonAst
      });

      languageBreakdown[language] = (languageBreakdown[language] ?? 0) + 1;
      for (const cap of capabilities) {
        topCapabilities[cap] = (topCapabilities[cap] ?? 0) + 1;
      }
      totalBytes += sizeBytes;
      totalLines += lineCount;
    }

    const idf = this.computeIdf(fileMap);
    const tfidfNorms = new Map<string, number>();
    for (const [filePath, file] of fileMap.entries()) {
      tfidfNorms.set(filePath, vectorNorm(file.tokens, idf));
    }

    const graph = buildDependencyGraph(fileMap);
    const graphDb = await saveGraphDb(normalizedRoot, graph.forward, graph.reverse);
    const pythonCallGraph = this.buildPythonCallGraph(fileMap);

    this.index = {
      stats: {
        rootPath: normalizedRoot,
        indexedAt: new Date().toISOString(),
        fileCount: fileMap.size,
        totalBytes,
        totalLines,
        languageBreakdown,
        topCapabilities,
        graphDb
      },
      files: fileMap,
      tfidfNorms,
      inverseDocumentFrequency: idf,
      dependencyGraph: graph.forward,
      reverseDependencyGraph: graph.reverse,
      pythonCallGraph
    };

    return this.index;
  }

  private computeIdf(files: Map<string, FileInfo>): Map<string, number> {
    const documentCount = files.size;
    const docsPerTerm = new Map<string, number>();

    for (const file of files.values()) {
      for (const term of file.tokens.keys()) {
        docsPerTerm.set(term, (docsPerTerm.get(term) ?? 0) + 1);
      }
    }

    const idf = new Map<string, number>();
    for (const [term, docs] of docsPerTerm.entries()) {
      idf.set(term, Math.log((1 + documentCount) / (1 + docs)) + 1);
    }
    return idf;
  }

  private buildPythonCallGraph(files: Map<string, FileInfo>): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    for (const file of files.values()) {
      if (!file.pythonAst) {
        continue;
      }
      for (const fn of file.pythonAst.functions) {
        const key = `${file.path}:${fn.qualname}`;
        graph.set(key, new Set(fn.calls));
      }
    }
    return graph;
  }
}
