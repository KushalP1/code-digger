import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from "@modelcontextprotocol/sdk/types.js";
import { RepoIndexer } from "./indexer.js";
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
          return asText(
            askCodebase(index, String(args.question ?? ""), Number(args.topK ?? 8))
          );
        }
        case "summarize_scope": {
          const index = ensureIndex();
          return asText(summarizeScope(index, args.scopePath ? String(args.scopePath) : undefined));
        }
        case "trace_feature": {
          const index = ensureIndex();
          return asText(traceFeature(index, String(args.feature ?? "")));
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
