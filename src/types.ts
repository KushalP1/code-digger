export type SummaryLevel = "repo" | "folder" | "file" | "symbol";

export interface SymbolInfo {
  name: string;
  kind: "class" | "function" | "type" | "interface" | "const" | "module";
  line: number;
}

export interface PythonAstFunction {
  name: string;
  qualname: string;
  line: number;
  isAsync: boolean;
  decorators: string[];
  calls: string[];
}

export interface PythonAstClass {
  name: string;
  qualname: string;
  line: number;
  bases: string[];
  decorators: string[];
}

export interface PythonAstFile {
  imports: string[];
  functions: PythonAstFunction[];
  classes: PythonAstClass[];
}

export interface FileInfo {
  path: string;
  language: string;
  sizeBytes: number;
  lineCount: number;
  imports: string[];
  symbols: SymbolInfo[];
  tokens: Map<string, number>;
  summary: string;
  capabilityTags: string[];
  pythonAst?: PythonAstFile;
}

export interface RepoStats {
  rootPath: string;
  indexedAt: string;
  fileCount: number;
  totalBytes: number;
  totalLines: number;
  languageBreakdown: Record<string, number>;
  topCapabilities: Record<string, number>;
}

export interface RepoIndex {
  stats: RepoStats;
  files: Map<string, FileInfo>;
  tfidfNorms: Map<string, number>;
  inverseDocumentFrequency: Map<string, number>;
  dependencyGraph: Map<string, Set<string>>;
  reverseDependencyGraph: Map<string, Set<string>>;
  pythonCallGraph: Map<string, Set<string>>;
}

export interface AskResponse {
  answer: string;
  topFiles: Array<{
    path: string;
    score: number;
    summary: string;
    capabilityTags: string[];
  }>;
  architectureContext: {
    directlyUsedBy: string[];
    directlyUses: string[];
    primaryPythonCalls: Array<{
      from: string;
      calls: string[];
    }>;
  };
}
