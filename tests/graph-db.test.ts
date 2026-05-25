import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { graphDbPath, graphDbStatus, loadGraphDb, queryGraphDbNeighbors, saveGraphDb } from "../src/graphDb.js";

describe("graph db backing", () => {
  it("persists and loads graph database snapshot", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "code-digger-graph-"));
    const f1 = path.join(repoRoot, "src/a.ts");
    const f2 = path.join(repoRoot, "src/b.ts");
    const f3 = path.join(repoRoot, "src/c.ts");
    const forward = new Map<string, Set<string>>([
      [f1, new Set([f2])],
      [f2, new Set([f3])],
      [f3, new Set<string>()]
    ]);
    const reverse = new Map<string, Set<string>>([
      [f1, new Set<string>()],
      [f2, new Set([f1])],
      [f3, new Set([f2])]
    ]);

    const saved = await saveGraphDb(repoRoot, forward, reverse);
    assert.equal(saved.nodeCount, 3);
    assert.ok(saved.edgeCount >= 2);
    assert.equal(saved.filePath, graphDbPath(repoRoot));

    const loaded = await loadGraphDb(repoRoot);
    assert.ok(loaded);
    assert.equal(loaded?.nodeCount, 3);
    assert.equal(loaded?.edgeCount, 2);
  });

  it("queries neighbors from persisted graph without index", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "code-digger-graph-"));
    const f1 = path.join(repoRoot, "routers/chat.py");
    const f2 = path.join(repoRoot, "services/orchestrator.py");
    const f3 = path.join(repoRoot, "utils/sse.py");
    const forward = new Map<string, Set<string>>([
      [f1, new Set([f2])],
      [f2, new Set([f3])],
      [f3, new Set<string>()]
    ]);
    const reverse = new Map<string, Set<string>>([
      [f1, new Set<string>()],
      [f2, new Set([f1])],
      [f3, new Set([f2])]
    ]);
    await saveGraphDb(repoRoot, forward, reverse);
    const db = await loadGraphDb(repoRoot);
    assert.ok(db);
    const result = queryGraphDbNeighbors(db!, "services/orchestrator.py", {
      direction: "both",
      depth: 2,
      maxNodes: 50
    }) as {
      found: boolean;
      traversal: { forward: string[]; reverse: string[] };
      direct: { forward: string[]; reverse: string[] };
    };
    assert.equal(result.found, true);
    assert.equal(result.direct.forward.length, 1);
    assert.equal(result.direct.reverse.length, 1);
    assert.ok(result.traversal.forward.some((item) => item.endsWith("utils/sse.py")));
    assert.ok(result.traversal.reverse.some((item) => item.endsWith("routers/chat.py")));
  });

  it("reports graph db status", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "code-digger-graph-"));
    const before = (await graphDbStatus(repoRoot)) as { exists: boolean };
    assert.equal(before.exists, false);

    const f1 = path.join(repoRoot, "src/a.ts");
    const forward = new Map<string, Set<string>>([[f1, new Set<string>()]]);
    const reverse = new Map<string, Set<string>>([[f1, new Set<string>()]]);
    await saveGraphDb(repoRoot, forward, reverse);
    const after = (await graphDbStatus(repoRoot)) as {
      exists: boolean;
      nodeCount: number;
      edgeCount: number;
    };
    assert.equal(after.exists, true);
    assert.equal(after.nodeCount, 1);
    assert.equal(after.edgeCount, 0);
  });
});
