import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PythonAstFile } from "./types.js";

interface PythonAstBatchResponse {
  ok: boolean;
  files?: Record<string, PythonAstFile>;
  error?: string;
}

function runPythonParser(
  scriptPath: string,
  payload: { files: string[]; timeoutSeconds: number }
): Promise<PythonAstBatchResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`python3 exited with code ${code}: ${stderr || "unknown error"}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as PythonAstBatchResponse;
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Failed to parse python AST response: ${String(error)}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export async function parsePythonAstForFiles(files: string[]): Promise<Map<string, PythonAstFile>> {
  if (files.length === 0) {
    return new Map<string, PythonAstFile>();
  }

  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "scripts",
    "python_ast_index.py"
  );
  const response = await runPythonParser(scriptPath, {
    files,
    timeoutSeconds: 20
  });

  if (!response.ok || !response.files) {
    throw new Error(response.error ?? "Python AST parsing failed.");
  }

  return new Map<string, PythonAstFile>(Object.entries(response.files));
}

export function pythonAstToSymbols(ast: PythonAstFile) {
  return [
    ...ast.classes.map((klass) => ({
      name: klass.qualname,
      kind: "class" as const,
      line: klass.line
    })),
    ...ast.functions.map((fn) => ({
      name: fn.qualname,
      kind: "function" as const,
      line: fn.line
    }))
  ];
}
