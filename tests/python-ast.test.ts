import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parsePythonAstForFiles } from "../src/pythonAst.js";

describe("python ast parser", () => {
  it("extracts inheritance, decorators and calls", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "code-digger-py-"));
    const filePath = path.join(dir, "service.py");

    const source = `
from app.base import BaseService

def traced(fn):
    return fn

@traced
class RetryService(BaseService):
    @staticmethod
    async def process(job):
        await send_metric(job)
        return format_result(job)
`;

    await writeFile(filePath, source, "utf8");

    const parsed = await parsePythonAstForFiles([filePath]);
    const ast = parsed.get(filePath);
    assert.ok(ast);

    assert.ok(ast?.imports.includes("app.base"));
    assert.ok(ast?.classes.some((klass) => klass.qualname === "RetryService"));
    assert.ok(
      ast?.classes.some((klass) => klass.bases.includes("BaseService") && klass.decorators.includes("traced"))
    );
    assert.ok(ast?.functions.some((fn) => fn.qualname === "RetryService.process"));
    assert.ok(
      ast?.functions.some(
        (fn) => fn.qualname === "RetryService.process" && fn.calls.includes("send_metric")
      )
    );

    await rm(dir, { recursive: true, force: true });
  });
});
