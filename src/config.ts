export interface IndexingConfig {
  maxFileBytes: number;
  maxFiles: number;
  maxSnippetLines: number;
  ignoreDirs: Set<string>;
  allowedExtensions: Set<string>;
}

export const DEFAULT_INDEXING_CONFIG: IndexingConfig = {
  maxFileBytes: 768_000,
  maxFiles: 100_000,
  maxSnippetLines: 50,
  ignoreDirs: new Set([
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".venv",
    "venv",
    "target",
    "coverage",
    ".idea",
    ".cursor"
  ]),
  allowedExtensions: new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".kts",
    ".swift",
    ".rb",
    ".php",
    ".cs",
    ".cpp",
    ".cc",
    ".c",
    ".h",
    ".hpp",
    ".scala",
    ".sql",
    ".md",
    ".yaml",
    ".yml",
    ".json"
  ])
};

export const CAPABILITY_KEYWORDS: Record<string, string[]> = {
  authentication: ["auth", "oauth", "token", "session", "login", "jwt", "sso"],
  payments: ["payment", "invoice", "billing", "stripe", "refund", "checkout"],
  notifications: ["notify", "email", "sms", "webhook", "push", "message"],
  analytics: ["analytics", "metric", "telemetry", "tracking", "event"],
  onboarding: ["onboard", "signup", "invite", "activation", "welcome"],
  reporting: ["report", "dashboard", "export", "insight", "kpi"],
  reliability: ["retry", "circuit", "backoff", "timeout", "queue", "dlq"],
  data: ["db", "database", "repository", "migration", "schema", "query"],
  api: ["api", "endpoint", "route", "controller", "handler", "rpc"]
};

export const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "from",
  "with",
  "this",
  "that",
  "these",
  "those",
  "into",
  "onto",
  "while",
  "where",
  "when",
  "what",
  "how",
  "why",
  "file",
  "module",
  "class",
  "function",
  "const",
  "let",
  "var",
  "public",
  "private",
  "protected",
  "return",
  "true",
  "false",
  "null",
  "undefined"
]);
