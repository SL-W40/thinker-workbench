/**
 * session 快照：保留控制台 tab 与完整设置分区。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";

describe("sessionStore tools tab + section", () => {
  let tmp: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tw-session-"));
    prevHome = process.env.THINKER_HOME;
    process.env.THINKER_HOME = tmp;
    // 清模块缓存，使 getDataDir / session 读到新 HOME
    for (const key of Object.keys(require.cache)) {
      if (
        key.includes(`${path.sep}config${path.sep}sessionStore`) ||
        key.includes(`${path.sep}config${path.sep}paths`)
      ) {
        delete require.cache[key];
      }
    }
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.THINKER_HOME;
    else process.env.THINKER_HOME = prevHome;
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("setSnapshot 保留 #/tools/logs 与 notifications 分区", async () => {
    const { setUiSessionSnapshot, getUiSessionSnapshot, resetSessionCache, saveSessionNow } =
      await import("../../src/config/sessionStore.js");
    resetSessionCache(false);
    setUiSessionSnapshot({
      hash: "#/tools/logs",
      settingsSection: "notifications",
      stack: { entries: ["tools"], index: 0, visited: ["chat", "tools"] },
    });
    saveSessionNow();
    resetSessionCache(true);
    const snap = getUiSessionSnapshot();
    assert.equal(snap.hash, "#/tools/logs");
    assert.equal(snap.settingsSection, "notifications");
  });

  it("setSnapshot 保留 #/tools/settings/browser", async () => {
    const { setUiSessionSnapshot, getUiSessionSnapshot, resetSessionCache, saveSessionNow } =
      await import("../../src/config/sessionStore.js");
    resetSessionCache(false);
    setUiSessionSnapshot({
      hash: "#/tools/settings/browser",
      settingsSection: "browser",
      stack: { entries: ["tools"], index: 0, visited: ["tools"] },
    });
    saveSessionNow();
    resetSessionCache(true);
    const snap = getUiSessionSnapshot();
    assert.equal(snap.hash, "#/tools/settings/browser");
    assert.equal(snap.settingsSection, "browser");
  });
});
