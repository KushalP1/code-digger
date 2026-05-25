import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from "@modelcontextprotocol/sdk/types.js";
import { RepoIndexer } from "./indexer.js";
import { buildQueryEmbeddingForIndex } from "./embeddingProvider.js";
import {
  architectureDiagram,
  askCodebase,
  autoUnderstandCodebase,
  impactAnalysis,
  learningPath,
  pythonSymbolInsight,
  summarizeScope,
  traceFeature
} from "./qa.js";
import { graphDbStatus, loadGraphDb, queryGraphDbNeighbors } from "./graphDb.js";
import { reviewGithubPrImpact, reviewPrImpact, reviewPrImpactFromFiles } from "./prImpact.js";

const indexer = new RepoIndexer();

const TOOLS: Tool[] = [
  {
    name: "ingest_repo",
    description: "Index a repository and build semantic/architecture maps.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: {
          type: "string",
          description: "Absolute path to repository root."
        }
      },
      required: ["rootPath"]
    }
  },
  {
    name: "ask_codebase",
    description: "Ask natural-language questions about implementation and intent.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        topK: { type: "number", default: 8 }
      },
      required: ["question"]
    }
  },
  {
    name: "summarize_scope",
    description: "Get repository, folder, or file summaries with capabilities.",
    inputSchema: {
      type: "object",
      properties: {
        scopePath: {
          type: "string",
          description: "Optional folder or file path substring."
        }
      }
    }
  },
  {
    name: "trace_feature",
    description: "Reconstruct end-to-end feature flow from semantic signals and dependencies.",
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string" }
      },
      required: ["feature"]
    }
  },
  {
    name: "impact_analysis",
    description: "Estimate blast radius and coupling for a file/module.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" }
      },
      required: ["filePath"]
    }
  },
  {
    name: "learning_path",
    description: "Generate guided onboarding path for beginner/senior/architect.",
    inputSchema: {
      type: "object",
      properties: {
        role: {
          type: "string",
          enum: ["beginner", "senior", "architect"]
        }
      },
      required: ["role"]
    }
  },
  {
    name: "python_symbol_insight",
    description:
      "Inspect Python AST details for a symbol (decorators, inheritance, async, and calls).",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" }
      },
      required: ["symbol"]
    }
  },
  {
    name: "auto_understand_codebase",
    description:
      "Generate automatic code-level understanding without user question. Supports low-token and caveman output.",
    inputSchema: {
      type: "object",
      properties: {
        tokenBudget: { type: "number", default: 500 },
        style: {
          type: "string",
          enum: ["compact", "caveman"],
          default: "compact"
        }
      }
    }
  },
  {
    name: "architecture_diagram",
    description:
      "Generate a low-token architecture dependency diagram (Mermaid), optionally in caveman style.",
    inputSchema: {
      type: "object",
      properties: {
        maxNodes: { type: "number", default: 14 },
        style: {
          type: "string",
          enum: ["compact", "caveman"],
          default: "compact"
        }
      }
    }
  },
  {
    name: "graph_db_status",
    description: "Show persisted graph database status for a repository.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: {
          type: "string",
          description: "Absolute path to repository root."
        }
      },
      required: ["rootPath"]
    }
  },
  {
    name: "graph_db_neighbors",
    description: "Query neighbors from persisted graph database without re-indexing.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: {
          type: "string",
          description: "Absolute path to repository root."
        },
        filePath: {
          type: "string",
          description: "File path (absolute or repo-relative suffix) to query."
        },
        direction: {
          type: "string",
          enum: ["forward", "reverse", "both"],
          default: "both"
        },
        depth: { type: "number", default: 2 },
        maxNodes: { type: "number", default: 200 }
      },
      required: ["rootPath", "filePath"]
    }
  },
  {
    name: "review_pr_impact",
    description:
      "Analyze PR-level architectural impact by diffing git refs and scoring graph blast radius.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: {
          type: "string",
          description: "Absolute path to git repository root."
        },
        baseRef: { type: "string", default: "main" },
        headRef: { type: "string", default: "HEAD" },
        maxFiles: { type: "number", default: 200 },
        transitiveDepth: { type: "number", default: 3 },
        commentStyle: { type: "string", enum: ["compact", "full"], default: "full" }
      },
      required: ["repoPath"]
    }
  },
  {
    name: "review_pr_impact_from_files",
    description:
      "Analyze PR-level architectural impact from an explicit changed-file list (CI-friendly).",
    inputSchema: {
      type: "object",
      properties: {
        changedFiles: {
          type: "array",
          items: { type: "string" },
          description: "Repository-relative changed file paths from PR/CI."
        },
        rootPath: {
          type: "string",
          description: "Optional repo root used for graph-db fallback when no in-memory index is loaded."
        },
        maxFiles: { type: "number", default: 300 },
        transitiveDepth: { type: "number", default: 3 },
        unifiedDiff: {
          type: "string",
          description: "Optional unified diff content for symbol-level hunk weighting."
        },
        commentStyle: { type: "string", enum: ["compact", "full"], default: "full" }
      },
      required: ["changedFiles"]
    }
  },
  {
    name: "review_github_pr_impact",
    description:
      "Analyze a GitHub PR via gh CLI and optionally post markdown review comment.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: {
          type: "string",
          description: "Absolute path to local git repository."
        },
        prNumber: { type: "number" },
        repo: {
          type: "string",
          description: "Optional GitHub repo in owner/name format for gh -R."
        },
        maxFiles: { type: "number", default: 300 },
        transitiveDepth: { type: "number", default: 3 },
        commentStyle: { type: "string", enum: ["compact", "full"], default: "full" },
        autoComment: {
          type: "boolean",
          default: false,
          description: "When true, posts prCommentMarkdown to the PR using gh."
        },
        forceNewComment: {
          type: "boolean",
          default: false,
          description: "When true with autoComment, always creates a new PR comment instead of updating existing."
        }
      },
      required: ["repoPath", "prNumber"]
    }
  }
];

function ensureIndex() {
  const index = indexer.getIndex();
  if (!index) {
    throw new Error("Repository not indexed yet. Run ingest_repo first.");
  }
  return index;
}

function asText(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

export async function startServer() {
  const server = new Server(
    {
      name: "code-digger-mcp",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    try {
      switch (toolName) {
        case "ingest_repo": {
          const rootPath = String(args.rootPath ?? "");
          const index = await indexer.ingest(rootPath);
          return asText({
            status: "indexed",
            stats: index.stats
          });
        }
        case "ask_codebase": {
          const index = ensureIndex();
          const question = String(args.question ?? "");
          const queryEmbedding = await buildQueryEmbeddingForIndex(index, question);
          return asText(
            askCodebase(index, question, Number(args.topK ?? 8), {
              queryEmbedding
            })
          );
        }
        case "summarize_scope": {
          const index = ensureIndex();
          return asText(summarizeScope(index, args.scopePath ? String(args.scopePath) : undefined));
        }
        case "trace_feature": {
          const index = ensureIndex();
          const feature = String(args.feature ?? "");
          const queryEmbedding = await buildQueryEmbeddingForIndex(index, feature);
          return asText(traceFeature(index, feature, { queryEmbedding }));
        }
        case "impact_analysis": {
          const index = ensureIndex();
          return asText(impactAnalysis(index, String(args.filePath ?? "")));
        }
        case "learning_path": {
          const index = ensureIndex();
          const role = String(args.role ?? "beginner");
          if (role !== "beginner" && role !== "senior" && role !== "architect") {
            throw new Error("role must be one of: beginner, senior, architect.");
          }
          return asText(learningPath(index, role));
        }
        case "python_symbol_insight": {
          const index = ensureIndex();
          return asText(pythonSymbolInsight(index, String(args.symbol ?? "")));
        }
        case "auto_understand_codebase": {
          const index = ensureIndex();
          const style = String(args.style ?? "compact");
          if (style !== "compact" && style !== "caveman") {
            throw new Error("style must be one of: compact, caveman.");
          }
          return asText(
            autoUnderstandCodebase(index, {
              tokenBudget: Number(args.tokenBudget ?? 500),
              style
            })
          );
        }
        case "architecture_diagram": {
          const index = ensureIndex();
          const style = String(args.style ?? "compact");
          if (style !== "compact" && style !== "caveman") {
            throw new Error("style must be one of: compact, caveman.");
          }
          return asText(
            architectureDiagram(index, {
              maxNodes: Number(args.maxNodes ?? 14),
              style
            })
          );
        }
        case "graph_db_status": {
          const rootPath = String(args.rootPath ?? "");
          if (!rootPath) {
            throw new Error("rootPath is required.");
          }
          return asText(await graphDbStatus(rootPath));
        }
        case "graph_db_neighbors": {
          const rootPath = String(args.rootPath ?? "");
          const filePath = String(args.filePath ?? "");
          if (!rootPath || !filePath) {
            throw new Error("rootPath and filePath are required.");
          }
          const directionRaw = String(args.direction ?? "both");
          const direction = directionRaw === "forward" || directionRaw === "reverse" ? directionRaw : "both";
          const depth = Math.max(1, Math.min(6, Number(args.depth ?? 2)));
          const maxNodes = Math.max(20, Math.min(1200, Number(args.maxNodes ?? 200)));
          const db = await loadGraphDb(rootPath);
          if (!db) {
            throw new Error("Persisted graph database not found. Run ingest_repo first.");
          }
          return asText(
            queryGraphDbNeighbors(db, filePath, {
              direction,
              depth,
              maxNodes
            })
          );
        }
        case "review_pr_impact": {
          const index = indexer.getIndex();
          const repoPath = String(args.repoPath ?? "");
          if (!repoPath) {
            throw new Error("repoPath is required.");
          }
          return asText(
            await reviewPrImpact(index, {
              repoPath,
              baseRef: args.baseRef ? String(args.baseRef) : "main",
              headRef: args.headRef ? String(args.headRef) : "HEAD",
              maxFiles: Number(args.maxFiles ?? 200),
              transitiveDepth: Number(args.transitiveDepth ?? 3),
              commentStyle: args.commentStyle === "compact" ? "compact" : "full"
            })
          );
        }
        case "review_pr_impact_from_files": {
          const index = indexer.getIndex();
          const changedFilesRaw = Array.isArray(args.changedFiles) ? args.changedFiles : [];
          const changedFiles = changedFilesRaw.map((item) => String(item)).filter(Boolean);
          if (changedFiles.length === 0) {
            throw new Error("changedFiles must be a non-empty string array.");
          }
          return asText(
            await reviewPrImpactFromFiles(index, {
              changedFiles,
              maxFiles: Number(args.maxFiles ?? 300),
              transitiveDepth: Number(args.transitiveDepth ?? 3),
              unifiedDiff: args.unifiedDiff ? String(args.unifiedDiff) : undefined,
              commentStyle: args.commentStyle === "compact" ? "compact" : "full",
              rootPath: args.rootPath ? String(args.rootPath) : undefined
            })
          );
        }
        case "review_github_pr_impact": {
          const index = indexer.getIndex();
          const repoPath = String(args.repoPath ?? "");
          if (!repoPath) {
            throw new Error("repoPath is required.");
          }
          const prNumber = Number(args.prNumber ?? 0);
          if (!Number.isFinite(prNumber) || prNumber < 1) {
            throw new Error("prNumber must be a positive number.");
          }
          return asText(
            await reviewGithubPrImpact(index, {
              repoPath,
              prNumber,
              repo: args.repo ? String(args.repo) : undefined,
              maxFiles: Number(args.maxFiles ?? 300),
              transitiveDepth: Number(args.transitiveDepth ?? 3),
              autoComment: Boolean(args.autoComment ?? false),
              forceNewComment: Boolean(args.forceNewComment ?? false),
              commentStyle: args.commentStyle === "compact" ? "compact" : "full"
            })
          );
        }
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown tool failure";
      return asText({
        status: "error",
        toolName,
        message
      });
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
