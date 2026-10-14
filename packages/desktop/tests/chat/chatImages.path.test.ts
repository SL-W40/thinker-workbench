/**
 * 附图路径安全：须落在 workspaces/<id>/images 下。
 * 不依赖 Electron nativeImage（仅测 resolveAllowedChatImagePath）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

vi.mock("../../src/config/paths", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/config/paths")>("../../src/config/paths");
  return {
    ...actual,
    getDataDir: () => (globalThis as { __twTestDataDir?: string }).__twTestDataDir ?? "",
  };
});

vi.mock("../../src/db/workspacesStore", () => ({
  getWorkspace: () => ({ id: "ws1", name: "W", rootPath: "/tmp" }),
}));

vi.mock("electron", () => ({
  nativeImage: {
    createFromBuffer: () => ({
      isEmpty: () => true,
      getSize: () => ({ width: 0, height: 0 }),
      resize: () => ({
        isEmpty: () => true,
        getSize: () => ({ width: 0, height: 0 }),
        toPNG: () => Buffer.alloc(0),
        toJPEG: () => Buffer.alloc(0),
      }),
      toPNG: () => Buffer.alloc(0),
      toJPEG: () => Buffer.alloc(0),
    }),
  },
}));

describe("resolveAllowedChatImagePath", () => {
  let dataDir: string;
  let imagePath: string;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-chat-img-"));
    (globalThis as { __twTestDataDir?: string }).__twTestDataDir = dataDir;
    const dir = path.join(dataDir, "workspaces", "ws1", "images");
    fs.mkdirSync(dir, { recursive: true });
    imagePath = path.join(dir, "a.png");
    fs.writeFileSync(imagePath, Buffer.from([1, 2, 3]));
  });

  afterEach(() => {
    delete (globalThis as { __twTestDataDir?: string }).__twTestDataDir;
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("允许 images 目录内文件", async () => {
    const { resolveAllowedChatImagePath } = await import("../../src/chat/chatImages");
    assert.equal(resolveAllowedChatImagePath(imagePath), path.resolve(imagePath));
  });

  it("拒绝目录外路径", async () => {
    const { resolveAllowedChatImagePath } = await import("../../src/chat/chatImages");
    const outside = path.join(dataDir, "secret.bin");
    fs.writeFileSync(outside, Buffer.from([9]));
    assert.equal(resolveAllowedChatImagePath(outside), null);
  });

  it("非法 mime 被拒绝", async () => {
    const { saveChatImage } = await import("../../src/chat/chatImages");
    assert.throws(
      () =>
        saveChatImage("ws1", {
          bytes: new Uint8Array([1, 2, 3]),
          mime: "application/pdf",
        }),
      /Unsupported image type/,
    );
  });
});
