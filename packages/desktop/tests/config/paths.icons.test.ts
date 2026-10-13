/**
 * OS 图标分平台：Windows 解析到 win/（旧版大图标），其它平台优先 mac/。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => os.tmpdir(),
  },
}));

import {
  getAppIconPath,
  resetAppPathsCacheForTests,
  setAppPathsForTests,
} from "../../src/config/paths";

const resourcesRoot = path.resolve(__dirname, "../../resources");

beforeEach(() => {
  resetAppPathsCacheForTests();
  setAppPathsForTests({
    rendererIndexHtml: path.join(os.tmpdir(), "index.html"),
    engineEntry: path.join(os.tmpdir(), "entry.js"),
    bundledRoot: os.tmpdir(),
    // 与开发态一致：先 artifacts 再 resources；此处只挂真实 resources
    iconSearchRoots: [resourcesRoot],
  });
});

afterEach(() => {
  resetAppPathsCacheForTests();
});

describe("getAppIconPath 分平台", () => {
  it("win32 命中 resources/win 旧版大图标", () => {
    const prev = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      const iconPath = getAppIconPath();
      assert.equal(iconPath, path.join(resourcesRoot, "win", "icon.ico"));
      assert.ok(fs.existsSync(iconPath), iconPath);
      // 旧版大图标体积大于 mac 新版 PNG
      const winPng = path.join(resourcesRoot, "win", "icon.png");
      const macPng = path.join(resourcesRoot, "mac", "icon.png");
      assert.ok(fs.statSync(winPng).size > fs.statSync(macPng).size);
    } finally {
      Object.defineProperty(process, "platform", { value: prev });
    }
  });

  it("darwin 命中 resources/mac", () => {
    const prev = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });
    try {
      const iconPath = getAppIconPath();
      assert.equal(iconPath, path.join(resourcesRoot, "mac", "icon.png"));
      assert.ok(fs.existsSync(iconPath), iconPath);
    } finally {
      Object.defineProperty(process, "platform", { value: prev });
    }
  });
});
