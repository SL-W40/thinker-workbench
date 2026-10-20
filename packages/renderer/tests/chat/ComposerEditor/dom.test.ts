/**
 * ComposerEditor DOM 序列化与光标（dom.ts，jsdom）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  atLabel,
  chipKey,
  domChipKey,
  getPlainCaret,
  lastMeaningfulChild,
  serializeComposerEditor,
  setPlainCaret,
} from "../../../src/features/chat/ComposerEditor/dom";
import { createChip, fillEditor } from "../../../src/features/chat/ComposerEditor/mutate";

function editor(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("atLabel", () => {
  it("takes the last segment, normalizing backslashes", () => {
    assert.equal(atLabel("src/app.ts"), "app.ts");
    assert.equal(atLabel("src\\util\\i.ts"), "i.ts");
    assert.equal(atLabel("plain"), "plain");
  });
});

describe("serializeComposerEditor", () => {
  it("joins text, chips and breaks; ignores pad br", () => {
    const el = editor();
    el.appendChild(document.createTextNode("hello "));
    el.appendChild(createChip("at", "src/app.ts"));
    const pad = document.createElement("br");
    pad.dataset.pad = "1";
    el.appendChild(pad);
    assert.equal(serializeComposerEditor(el), "hello @src/app.ts");
  });

  it("keeps user newlines and quotes paths with spaces", () => {
    const el = editor();
    fillEditor(el, "a\nb\n");
    assert.equal(serializeComposerEditor(el), "a\nb\n");
    const withSpace = editor();
    withSpace.appendChild(createChip("at", "my dir/x.ts"));
    assert.equal(serializeComposerEditor(withSpace), "@`my dir/x.ts`");
  });

  it("drops the extra trailing newline of block wrappers", () => {
    const el = editor();
    const block = document.createElement("div");
    block.appendChild(document.createTextNode("x"));
    el.appendChild(block);
    assert.equal(serializeComposerEditor(el), "x");
  });
});

describe("lastMeaningfulChild", () => {
  it("skips pad br and empty text", () => {
    const el = editor();
    el.appendChild(document.createTextNode("x"));
    const pad = document.createElement("br");
    pad.dataset.pad = "1";
    el.appendChild(pad);
    el.appendChild(document.createTextNode(""));
    assert.equal(lastMeaningfulChild(el)?.textContent, "x");
    assert.equal(lastMeaningfulChild(editor()), null);
  });
});

describe("chipKey / domChipKey", () => {
  it("matches chips parsed from text with chips present in DOM", () => {
    const el = editor();
    // @ 段须带 @ 前缀，/ 段须为小写 kebab 词
    fillEditor(el, "/review @src/a.ts ", "display");
    assert.equal(domChipKey(el), "/review\n@src/a.ts");
    assert.equal(chipKey("/review @src/a.ts ", "display"), "/review\n@src/a.ts");
  });
});

describe("芯片粘性：删掉尾随空格不溶解回纯文本", () => {
  it("已固化的芯片在 edit 模式下免检", () => {
    const el = editor();
    fillEditor(el, "/review @src/a.ts ", "display");
    assert.equal(domChipKey(el), "/review\n@src/a.ts");
    // 删掉尾随空格后按 edit 重建：芯片应保住，而不是溶解成可编辑文本
    fillEditor(el, "/review @src/a.ts", "edit");
    assert.equal(domChipKey(el), "/review\n@src/a.ts");
  });

  it("手打的 token 永远保持文本：半截输入与带尾随空格都不成芯片", () => {
    const el = editor();
    fillEditor(el, "/re", "edit");
    assert.equal(domChipKey(el), "");
    // 完整打完并敲了空格，只要没从面板选中，就仍是文本
    fillEditor(el, "/review ", "edit");
    assert.equal(domChipKey(el), "");
    fillEditor(el, "@src/a.ts ", "edit");
    assert.equal(domChipKey(el), "");
  });

  it("外部写入（面板选中路径）用 display，仍会固化成芯片", () => {
    const el = editor();
    fillEditor(el, "/review @src/a.ts ", "display");
    assert.equal(domChipKey(el), "/review\n@src/a.ts");
  });

  it("chipKey 带上 pinned 后与 domChipKey 一致，避免每次输入都重绘", () => {
    const el = editor();
    fillEditor(el, "/review ", "display");
    const domKey = domChipKey(el);
    const pinned = new Set(domKey.split("\n").filter(Boolean));
    assert.equal(chipKey("/review", "edit", pinned), domKey);
    assert.equal(chipKey("/review", "edit"), "");
  });
});

describe("链接芯片", () => {
  it("序列化回完整 URL，DOM 只展示短标签", () => {
    const el = editor();
    const url = "https://github.com/a/b";
    el.appendChild(createChip("link", url));
    assert.equal(serializeComposerEditor(el), url);
    assert.equal(domChipKey(el), url);
    assert.ok(el.textContent?.includes("github.com/a/b"));
    assert.ok(!(el.textContent ?? "").includes("https://"));
  });

  it("粘贴的网址（pinned）回填成芯片，手打的不成芯片", () => {
    const el = editor();
    const url = "https://a.com/x";
    fillEditor(el, `${url} `, "edit", undefined, new Set([url]));
    assert.equal(domChipKey(el), url);
    fillEditor(el, "https://b.com/y ", "edit");
    assert.equal(domChipKey(el), "");
  });
});

describe("setPlainCaret / getPlainCaret", () => {
  it("round-trips an offset inside a text node", () => {
    const el = editor();
    fillEditor(el, "hello world");
    setPlainCaret(el, 5);
    assert.equal(getPlainCaret(el), 5);
    setPlainCaret(el, 999);
    assert.equal(getPlainCaret(el), 11);
  });

  it("places the caret after a chip when offset lands on it", () => {
    const el = editor();
    fillEditor(el, "@src/app.ts tail", "display");
    // 芯片长度 11（@src/app.ts），偏移落在其内部 → 停在芯片后
    setPlainCaret(el, 5);
    assert.equal(getPlainCaret(el), 11);
  });
});
