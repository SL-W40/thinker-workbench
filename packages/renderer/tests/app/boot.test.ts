/**
 * App 启动导航纯函数（app/boot.ts，jsdom）。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { isDevToolEmbed, readBoot, readWindowRole } from "../../src/app/boot";

afterEach(() => {
  // 复位查询串与 thinker 桩
  history.replaceState({}, "", "/");
  delete (window as unknown as { thinker?: unknown }).thinker;
});

describe("readWindowRole", () => {
  it("falls back to main when bridge is absent", () => {
    assert.deepEqual(readWindowRole(), { kind: "main" });
  });

  it("reads role from the bridge", () => {
    (window as unknown as { thinker: unknown }).thinker = {
      window: { getRoleSync: () => ({ kind: "aux", page: "tools" }) },
    };
    assert.deepEqual(readWindowRole(), { kind: "aux", page: "tools" });
  });
});

describe("isDevToolEmbed", () => {
  it("detects ?tool=1 only", () => {
    assert.equal(isDevToolEmbed(), false);
    history.replaceState({}, "", "/?tool=1");
    assert.equal(isDevToolEmbed(), true);
    history.replaceState({}, "", "/?tool=0");
    assert.equal(isDevToolEmbed(), false);
  });
});

describe("readBoot", () => {
  it("pins aux windows to their single page", () => {
    const boot = readBoot({ kind: "aux", page: "tools" } as never);
    assert.deepEqual(boot.stack.entries, ["tools"]);
    assert.equal(boot.stack.index, 0);
    assert.deepEqual(boot.stack.visited, ["tools"]);
  });

  it("boots main window from hash when no session snapshot", () => {
    history.replaceState({}, "", "/#/chat");
    const boot = readBoot({ kind: "main" });
    assert.deepEqual(boot.stack.entries, ["chat"]);
  });
});
