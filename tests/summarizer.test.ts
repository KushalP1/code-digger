import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectLanguage, extractImports, extractSymbols } from "../src/summarizer.js";

describe("python support", () => {
  it("detects python language by extension", () => {
    assert.equal(detectLanguage("/repo/services/billing/retries.py"), "python");
  });

  it("extracts python symbols from classes and functions", () => {
    const source = `
import os
from app.core.auth import session_guard

class CheckoutRetryService:
    pass

async def process_retry(job_id: str):
    return job_id

def build_invoice(id: str):
    return id
`;

    const symbols = extractSymbols(source);
    const names = symbols.map((symbol) => symbol.name);

    assert.ok(names.includes("CheckoutRetryService"));
    assert.ok(names.includes("process_retry"));
    assert.ok(names.includes("build_invoice"));
  });

  it("extracts python imports", () => {
    const source = `
import os
from app.core.auth import session_guard
`;
    const imports = extractImports(source);
    assert.ok(imports.includes("os"));
    assert.ok(imports.includes("app.core.auth"));
  });
});
