/**
 * tools schema 跨轮缓存：同键复用、换键重建、清空生效。
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import { getOrBuildToolsBundle, invalidateToolsCache } from "../../src/tools/cache";

/** 缓存键输入的全量默认值，单测里按需覆盖。 */
function keyInput(overrides: Partial<Parameters<typeof getOrBuildToolsBundle>[0]> = {}) {
  return {
    chatMode: "agent" as const,
    childReadonly: false,
    allowTask: true,
    allowShell: true,
    allowDelete: true,
    allowBrowser: true,
    mcpFingerprint: "fp",
    loadedToolNames: [] as string[],
    ...overrides,
  };
}

describe("getOrBuildToolsBundle", () => {
  beforeEach(() => {
    invalidateToolsCache();
  });

  it("相同入参命中缓存，build 只执行一次", () => {
    let calls = 0;
    const build = () => {
      calls += 1;
      return { tools: [], catalog: "", deferred: false };
    };
    const a = getOrBuildToolsBundle(keyInput(), build);
    const b = getOrBuildToolsBundle(keyInput(), build);
    assert.equal(calls, 1);
    assert.equal(a.tools, b.tools);
  });

  it("chatMode 变化即换缓存条目", () => {
    let calls = 0;
    const build = () => {
      calls += 1;
      return { tools: [], catalog: "", deferred: false };
    };
    getOrBuildToolsBundle(keyInput({ chatMode: "agent" }), build);
    getOrBuildToolsBundle(keyInput({ chatMode: "ask" }), build);
    assert.equal(calls, 2);
  });

  it("childReadonly / allowTask 各自影响缓存键", () => {
    let calls = 0;
    const build = () => {
      calls += 1;
      return { tools: [], catalog: "", deferred: false };
    };
    getOrBuildToolsBundle(keyInput(), build);
    getOrBuildToolsBundle(keyInput({ childReadonly: true }), build);
    getOrBuildToolsBundle(keyInput({ allowTask: false }), build);
    assert.equal(calls, 3);
  });

  it("三个运行时设置各自影响缓存键（避免设置变更后返回过期结果）", () => {
    let calls = 0;
    const build = () => {
      calls += 1;
      return { tools: [], catalog: "", deferred: false };
    };
    getOrBuildToolsBundle(keyInput(), build);
    getOrBuildToolsBundle(keyInput({ allowShell: false }), build);
    getOrBuildToolsBundle(keyInput({ allowDelete: false }), build);
    getOrBuildToolsBundle(keyInput({ allowBrowser: false }), build);
    assert.equal(calls, 4);
  });

  it("MCP 指纹变化（热重载）即换缓存条目", () => {
    let calls = 0;
    const build = () => {
      calls += 1;
      return { tools: [], catalog: "", deferred: false };
    };
    getOrBuildToolsBundle(keyInput({ mcpFingerprint: "a" }), build);
    getOrBuildToolsBundle(keyInput({ mcpFingerprint: "a,b" }), build);
    assert.equal(calls, 2);
  });

  it("已装载工具名集合变化即换缓存条目，且与顺序无关", () => {
    let calls = 0;
    const build = () => {
      calls += 1;
      return { tools: [], catalog: "", deferred: false };
    };
    const first = getOrBuildToolsBundle(keyInput({ loadedToolNames: ["a", "b"] }), build);
    const same = getOrBuildToolsBundle(keyInput({ loadedToolNames: ["b", "a"] }), build);
    const more = getOrBuildToolsBundle(keyInput({ loadedToolNames: ["a", "b", "c"] }), build);
    assert.equal(first.tools, same.tools);
    assert.notEqual(first.tools, more.tools);
    assert.equal(calls, 2);
  });

  it("invalidateToolsCache 后重新构建", () => {
    let calls = 0;
    const build = () => {
      calls += 1;
      return { tools: [], catalog: "", deferred: false };
    };
    const before = getOrBuildToolsBundle(keyInput(), build);
    invalidateToolsCache();
    const after = getOrBuildToolsBundle(keyInput(), build);
    assert.equal(calls, 2);
    assert.notEqual(before.tools, after.tools);
  });

  it("缓存条目包含序列化副本", () => {
    const tools = [
      { type: "function" as const, function: { name: "x", description: "d", parameters: {} } },
    ];
    const bundle = getOrBuildToolsBundle(keyInput(), () => ({
      tools,
      catalog: "",
      deferred: false,
    }));
    assert.equal(bundle.json, JSON.stringify(tools));
  });
});
