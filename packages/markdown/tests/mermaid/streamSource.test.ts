import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  renderablePrefix,
  sourceSignature,
  streamRenderSource,
} from "../../src/mermaid/streamSource";

describe("renderablePrefix", () => {
  it("drops the line being typed", () => {
    assert.deepEqual(renderablePrefix("graph TD\nA-->B\nC"), {
      text: "graph TD\nA-->B\n",
      atLineEnd: true,
    });
  });

  it("keeps everything when the buffer ends with a newline", () => {
    assert.deepEqual(renderablePrefix("graph TD\nA-->B\n"), {
      text: "graph TD\nA-->B\n",
      atLineEnd: true,
    });
  });

  it("has nothing renderable before the first line break", () => {
    assert.deepEqual(renderablePrefix("graph TD"), { text: "", atLineEnd: false });
    assert.deepEqual(renderablePrefix(""), { text: "", atLineEnd: false });
  });
});

describe("sourceSignature", () => {
  it("normalizes CRLF, trailing spaces and trailing blank lines", () => {
    assert.equal(sourceSignature("a\r\n b  \n\n"), "a\n b");
  });

  it("differs when a real line is added", () => {
    assert.notEqual(sourceSignature("graph TD\nA-->B\n"), sourceSignature("graph TD\nA-->B\nC\n"));
  });
});

describe("streamRenderSource", () => {
  const src = "graph TD\nA-->B\nC-->D";

  it("waits for a second line while streaming", () => {
    assert.equal(streamRenderSource("graph TD\nA-->B", true), null);
  });

  it("renders only complete lines while streaming", () => {
    assert.equal(streamRenderSource(`${src}\nC-`, true), `${src}\n`);
  });

  it("uses the full source once the fence is closed", () => {
    assert.equal(streamRenderSource("graph TD", false), "graph TD");
  });

  it("returns null for empty buffers", () => {
    assert.equal(streamRenderSource("", false), null);
    assert.equal(streamRenderSource("   \n", true), null);
  });
});
