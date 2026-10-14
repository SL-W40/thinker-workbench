/**
 * 窗口角色表：登记主窗 / 辅助窗，未知 contents 视为 main。
 */
import assert from "node:assert/strict";
import type { BrowserWindow } from "electron";
import { describe, it } from "vitest";
import {
  registerAuxWindow,
  registerMainWindow,
  roleForWebContents,
  unregisterContents,
} from "../../src/window/windowRoles";

function fakeWin(id: number): BrowserWindow {
  return { webContents: { id } } as BrowserWindow;
}

describe("windowRoles", () => {
  it("按 contents id 记住角色，注销后回到 main", () => {
    const mainId = registerMainWindow(fakeWin(11));
    const auxId = registerAuxWindow(fakeWin(12), "tools");
    assert.equal(mainId, 11);
    assert.deepEqual(roleForWebContents(11), { kind: "main" });
    assert.deepEqual(roleForWebContents(12), { kind: "aux", page: "tools" });
    assert.deepEqual(roleForWebContents(99), { kind: "main" });
    unregisterContents(auxId);
    assert.deepEqual(roleForWebContents(12), { kind: "main" });
    unregisterContents(mainId);
  });
});
