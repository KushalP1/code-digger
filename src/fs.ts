import { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { IndexingConfig } from "./config.js";

export async function walkCodeFiles(
  rootPath: string,
  config: IndexingConfig
): Promise<string[]> {
  const results: string[] = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: Dirent[] = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!config.ignoreDirs.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!config.allowedExtensions.has(ext)) {
        continue;
      }

      try {
        const fileStat = await stat(fullPath);
        if (fileStat.size <= config.maxFileBytes) {
          results.push(fullPath);
        }
      } catch {
        // Skip unreadable files.
      }

      if (results.length >= config.maxFiles) {
        return results;
      }
    }
  }

  return results;
}

export async function safeReadUtf8(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}
