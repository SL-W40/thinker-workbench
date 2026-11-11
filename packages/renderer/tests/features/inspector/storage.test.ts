/**
 * 最近文件与 inspector UI 的 localStorage 读写。
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import { loadFileRecents, pushFileRecent } from "../../../src/features/inspector/fileRecents";
import {
  browserTabTitle,
  flushInspectorUi,
  hydrateTabs,
  loadInspectorUi,
  patchInspectorUi,
  pinChangesTab,
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

    const titles = {
      changes: "变更",
      files: "文件",
      terminal: "终端",
      browser: "浏览器",
      plan: "计划",
    };
    const withoutChanges = hydrateTabs([{ kind: "terminal" }], titles);
    const pinned = pinChangesTab(withoutChanges, "变更");
    assert.equal(pinned[0]?.key, "changes");
    assert.equal(pinned[1]?.kind, "terminal");
    assert.equal(pinChangesTab(pinned, "变更"), pinned);
    assert.equal(resolveActiveKey(pinned, ""), "changes");

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

  it("可以同时记下多个浏览器标签；旧数据还原成一个 legacy 标签", () => {
    const tabs: StageTab[] = [
      {
        key: "browser:a",
        kind: "browser",
        title: "百度",
        browserId: "a",
        url: "https://www.baidu.com/",
      },
      {
        key: "browser:b",
        kind: "browser",
        title: "浏览器",
        browserId: "b",
        url: "",
      },
    ];
    assert.deepEqual(serializeTabs(tabs), [
      { kind: "browser", id: "a", url: "https://www.baidu.com/" },
      { kind: "browser", id: "b" },
    ]);
    const hydrated = hydrateTabs(
      [{ kind: "browser", id: "a", url: "https://www.baidu.com/" }, { kind: "browser" }],
      { changes: "变更", files: "文件", terminal: "终端", browser: "浏览器", plan: "计划" },
      "https://legacy.example/",
    );
    assert.equal(hydrated.length, 2);
    assert.equal(hydrated[0]?.key, "browser:a");
    assert.equal(hydrated[0]?.kind === "browser" ? hydrated[0].url : "", "https://www.baidu.com/");
    assert.equal(hydrated[1]?.key, "browser:legacy");
    assert.equal(hydrated[1]?.kind === "browser" ? hydrated[1].url : "", "https://legacy.example/");
  });

  it("浏览器标签用页面标题，空白页退回默认文案", () => {
    assert.equal(
      browserTabTitle({ title: "百度一下，你就知道", url: "https://www.baidu.com/" }, "浏览器"),
      "百度一下，你就知道",
    );
    assert.equal(
      browserTabTitle({ title: "  ", url: "https://www.baidu.com/" }, "浏览器"),
      "浏览器",
    );
    assert.equal(browserTabTitle({ title: "about:blank", url: "about:blank" }, "浏览器"), "浏览器");
    assert.equal(browserTabTitle({ title: "", url: "about:blank" }, "Browser"), "Browser");
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
