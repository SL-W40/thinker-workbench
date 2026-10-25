import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  renderablePrefix,
  renderRequestKey,
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

describe("renderRequestKey", () => {
  const src = "graph TD\nA-->B\nC-->D\n";
  const theme = ["default", "dark", "classic"] as const;
  const key = (source: string, incomplete: boolean) =>
    renderRequestKey(source, theme[0], theme[1], theme[2], incomplete);

  it("stays stable when content and streaming state are unchanged", () => {
    assert.equal(key(src, true), key(src, true));
    assert.equal(key(src, false), key(src, false));
  });

  it("separates the streaming prefix from the closed final render", () => {
    // 流式最后一次排期与定稿内容相同：键也必须不同，否则闭合时那次渲染会被去重吞掉
    assert.notEqual(key(src, true), key(src, false));
  });

  it("changes when the source changes", () => {
    assert.notEqual(key(src, false), key(`${src}D-->E\n`, false));
  });

  it("changes when theme or look changes", () => {
    const base = renderRequestKey(src, "t1", "dark", "classic", false);
    assert.notEqual(base, renderRequestKey(src, "t2", "dark", "classic", false));
    assert.notEqual(base, renderRequestKey(src, "t1", "default", "classic", false));
    assert.notEqual(base, renderRequestKey(src, "t1", "dark", "handDrawn", false));
  });
});
