/**
 * 更新模块的三条硬约束（不依赖真实 electron-updater）：
 * 1. dev（未打包）构建整体不启用；
 * 2. 依赖缺失 / 初始化异常都降级为 disabled，不抛到调用方；
 * 3. 未启用时 check / download / install 返回明确状态而不是崩掉。
 */
import assert from "node:assert/strict";
import { emptyUpdateState } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  checkForUpdate,
  downloadUpdate,
  getUpdateState,
  initUpdater,
  installUpdate,
  isUpdateEnabled,
} from "../../src/update/updater";

describe("更新模块（未打包场景）", () => {
  it("isPackaged=false 时不启用，也不去加载依赖", () => {
    const state = initUpdater(() => "1.2.3", false);
    assert.equal(state.enabled, false);
    assert.equal(state.phase, "disabled");
    assert.equal(state.currentVersion, "1.2.3");
    assert.equal(isUpdateEnabled(), false);
  });

  it("未启用时 check / download 直接回当前状态，不抛错", async () => {
    initUpdater(() => "1.2.3", false);
    const checked = await checkForUpdate();
    assert.equal(checked.enabled, false);
    const downloaded = await downloadUpdate();
    assert.equal(downloaded.enabled, false);
    assert.equal(installUpdate(), false);
  });

  it("打包态但依赖缺失时降级为 disabled（而非崩溃）", () => {
    // 本仓库默认不装 electron-updater，这里即走真实降级路径
    const state = initUpdater(() => "9.9.9", true);
    assert.equal(state.enabled, false);
    assert.equal(state.currentVersion, "9.9.9");
    assert.equal(isUpdateEnabled(), false);
  });

  it("getUpdateState 始终返回可读快照", () => {
    initUpdater(() => "0.0.0", false);
    const state = getUpdateState();
    assert.equal(typeof state.phase, "string");
    assert.equal(typeof state.currentVersion, "string");
    assert.equal(typeof state.enabled, "boolean");
  });

  it("契约层：可用的空状态是 idle，禁用的是 disabled", () => {
    assert.equal(emptyUpdateState("1.0.0", true).phase, "idle");
    assert.equal(emptyUpdateState("1.0.0", false).phase, "disabled");
  });
});
