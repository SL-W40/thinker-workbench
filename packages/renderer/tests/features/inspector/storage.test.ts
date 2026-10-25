/**
 * 最近文件与 inspector UI 的 localStorage 读写。
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import { loadFileRecents, pushFileRecent } from "../../../src/features/inspector/fileRecents";
import {
  flushInspectorUi,
  hydrateTabs,
  loadInspectorUi,
  patchInspectorUi,
  resolveActiveKey,
  serializeTabs,
} from "../../../src/features/inspector/inspectorUi";
import type { StageTab } from "../../../src/features/inspector/types";

function memoryStorage() {
  const store = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
}

describe("file recents", () => {
  beforeEach(() => memoryStorage());

  it("没有工作区是空列表；重复路径顶到前面，最多 7 条", () => {
    assert.deepEqual(loadFileRecents(null), []);
    pushFileRecent("ws", "a");
    pushFileRecent("ws", "b");
    pushFileRecent("ws", "a");
    assert.deepEqual(loadFileRecents("ws"), ["a", "b"]);
    for (let i = 0; i < 10; i++) pushFileRecent("ws", `f${i}`);
    assert.equal(loadFileRecents("ws").length, 7);
    assert.equal(loadFileRecents("ws")[0], "f9");
  });

  it("坏 JSON 当成没有", () => {
    localStorage.setItem("thinker.file.recents.v1.ws", "{");
    assert.deepEqual(loadFileRecents("ws"), []);
  });
});

describe("inspector ui", () => {
  beforeEach(() => memoryStorage());

  it("草稿标签不落盘；损坏数据回到默认；宽度被夹住", () => {
    const tabs: StageTab[] = [
      { key: "changes", kind: "changes", title: "Changes" },
      { key: "draft:1", kind: "file", title: "untitled", path: "" },
      { key: "file:src/a.ts", kind: "file", title: "a.ts", path: "src/a.ts" },
      { key: "sub", kind: "subagent", title: "Task", taskId: "t", subagent: "explore" },
    ];
    assert.deepEqual(serializeTabs(tabs), [
      { kind: "changes" },
      { kind: "file", path: "src/a.ts" },
    ]);

    const hydrated = hydrateTabs(
      [{ kind: "changes" }, { kind: "changes" }, { kind: "file", path: "src/a.ts" }],
      { changes: "变更", files: "文件", terminal: "终端", browser: "浏览器", plan: "计划" },
    );
    assert.equal(hydrated.length, 2);
    assert.equal(hydrated[1]?.title, "a.ts");
    assert.equal(resolveActiveKey(hydrated, "missing"), "changes");

    assert.equal(loadInspectorUi(null).tabs.length, 0);
    patchInspectorUi("ws", { filesListWidth: 10, activeKey: "changes", tabs: [{ kind: "files" }] });
    // 落盘是防抖的（避免切 tab / 拖宽度时连续同步写），断言前先冲刷
    flushInspectorUi();
    const loaded = loadInspectorUi("ws");
    assert.equal(loaded.filesListWidth, 180);
    assert.equal(loaded.activeKey, "changes");
    assert.deepEqual(loaded.tabs, [{ kind: "files" }]);

    localStorage.setItem("thinker.inspector.ui.v1.ws", "{");
    assert.equal(loadInspectorUi("ws").activeKey, "");
  });

  it("浏览器地址可持久化与还原；损坏值回退空串", () => {
    assert.equal(loadInspectorUi("ws").browserUrl, "");
    patchInspectorUi("ws", { browserUrl: "https://example.com/docs" });
    flushInspectorUi();
    assert.equal(loadInspectorUi("ws").browserUrl, "https://example.com/docs");
    // 合并写回不清掉其它字段
    patchInspectorUi("ws", { openDirs: ["src"] });
    flushInspectorUi();
    assert.equal(loadInspectorUi("ws").browserUrl, "https://example.com/docs");

    localStorage.setItem(
      "thinker.inspector.ui.v1.ws",
      JSON.stringify({ browserUrl: 42, tabs: [] }),
    );
    assert.equal(loadInspectorUi("ws").browserUrl, "");
  });
});
