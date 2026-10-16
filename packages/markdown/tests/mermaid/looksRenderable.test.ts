import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { looksRenderable } from "../../src/mermaid/looksRenderable";

describe("looksRenderable", () => {
  it("rejects too-short or single-line buffers", () => {
    assert.equal(looksRenderable("flowchart"), false);
    assert.equal(looksRenderable("flowchart TD"), false);
  });

  it("accepts a minimal flowchart", () => {
    assert.equal(looksRenderable("flowchart TD\nA-->B"), true);
  });

  it("rejects unknown diagram headers", () => {
    assert.equal(looksRenderable("notADiagram\nA-->B"), false);
  });
});
