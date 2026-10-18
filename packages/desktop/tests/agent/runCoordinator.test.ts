/**
 * RunCoordinator：并行默认值；admitRun 只信会话登记的 workspace 根。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_MAX_PARALLEL_RUNS } from "@thinker-workbench/shared";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

vi.mock("../../src/config/settingsStore", () => ({
  getGeneralSettings: () => ({ maxParallelRuns: DEFAULT_MAX_PARALLEL_RUNS }),
}));

vi.mock("../../src/db/workspacesStore", async () => {
  const actual = await vi.importActual<typeof import("../../src/db/workspacesStore")>(
    "../../src/db/workspacesStore",
  );
  return {
    ...actual,
    getSession: vi.fn(),
    getSessionByThreadId: vi.fn(() => null),
    getSessionByActiveRunId: vi.fn(() => null),
    getWorkspace: vi.fn(),
    countRunningSessions: vi.fn(() => 0),
  };
});

import { admitRun } from "../../src/agent/runCoordinator";
import * as workspacesStore from "../../src/db/workspacesStore";

describe("RunCoordinator 默认并行上限", () => {
  it("出厂默认与 shared 一致为 3", () => {
    assert.equal(DEFAULT_MAX_PARALLEL_RUNS, 3);
  });
});

describe("admitRun 工作区根", () => {
  let registeredRoot: string;
  let forgedRoot: string;

  beforeEach(() => {
    registeredRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tw-ws-reg-"));
    forgedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tw-ws-forge-"));
    vi.mocked(workspacesStore.getSession).mockReturnValue({
      id: "sess-1",
      threadId: "thr-1",
      workspaceId: "ws-1",
      title: "t",
      pinned: false,
      sortOrder: 0,
      runStatus: "idle",
      activeRunId: null,
      interruptReason: null,
      createdAt: 0,
      updatedAt: 0,
    });
    vi.mocked(workspacesStore.getWorkspace).mockReturnValue({
      id: "ws-1",
      name: "Registered",
      rootPath: registeredRoot,
      pinned: false,
      sortOrder: 0,
      createdAt: 0,
      updatedAt: 0,
      isDefault: false,
    });
    vi.mocked(workspacesStore.countRunningSessions).mockReturnValue(0);
  });

  afterEach(() => {
    vi.clearAllMocks();
    for (const dir of [registeredRoot, forgedRoot]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("用 session.workspaceId 对应的 rootPath，忽略请求里另给的存在目录", () => {
    // 模拟旧客户端 / 伪造载荷仍带 workspaceRoot
    const result = admitRun({
      sessionId: "sess-1",
      workspaceRoot: forgedRoot,
    } as Parameters<typeof admitRun>[0] & { workspaceRoot: string });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.workspaceRoot, path.resolve(registeredRoot));
    assert.notEqual(result.workspaceRoot, path.resolve(forgedRoot));
  });

  it("登记根不存在时拒绝", () => {
    fs.rmSync(registeredRoot, { recursive: true, force: true });
    const result = admitRun({ sessionId: "sess-1" });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /workspace/i);
  });
});
