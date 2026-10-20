/**
 * workspacesStore 行映射纯函数（rows.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getDefaultWorkspaceRoot } from "../../../src/config/paths";
import {
  isDefaultWorkspaceRoot,
  mapSession,
  mapThread,
  mapWorkspace,
  normalizeRunStatus,
} from "../../../src/db/workspacesStore/rows";

const WS_ROW = {
  id: "ws1",
  name: "WS",
  root_path: "C:\\repo",
  pinned: 1,
  sort_order: 3,
  created_at: 100,
  updated_at: 200,
};

const SESSION_ROW = {
  id: "s1",
  thread_id: "th1",
  workspace_id: "ws1",
  title: "会话",
  pinned: 0,
  sort_order: 2,
  run_status: "running",
  active_run_id: "run1",
  interrupt_reason: null,
  created_at: 100,
  updated_at: 200,
};

describe("normalizeRunStatus", () => {
  it("keeps known statuses", () => {
    for (const s of ["idle", "running", "queued", "cancelled", "crashed", "failed"] as const) {
      assert.equal(normalizeRunStatus(s), s);
    }
  });

  it("falls back to idle on unknown", () => {
    assert.equal(normalizeRunStatus("bogus"), "idle");
    assert.equal(normalizeRunStatus(""), "idle");
  });
});

describe("mapWorkspace", () => {
  it("maps snake_case row to record", () => {
    const ws = mapWorkspace(WS_ROW);
    assert.equal(ws.id, "ws1");
    assert.equal(ws.rootPath, "C:\\repo");
    assert.equal(ws.pinned, true);
    assert.equal(ws.sortOrder, 3);
    assert.equal(ws.createdAt, 100);
    assert.equal(ws.isDefault, false);
  });

  it("flags the default workspace root", () => {
    const ws = mapWorkspace({ ...WS_ROW, root_path: getDefaultWorkspaceRoot() });
    assert.equal(ws.isDefault, true);
  });
});

describe("mapSession", () => {
  it("maps fields and normalizes run_status", () => {
    const s = mapSession(SESSION_ROW);
    assert.equal(s.threadId, "th1");
    assert.equal(s.workspaceId, "ws1");
    assert.equal(s.runStatus, "running");
    assert.equal(s.activeRunId, "run1");
    assert.equal(s.pinned, false);
  });

  it("normalizes unknown run_status to idle", () => {
    const s = mapSession({ ...SESSION_ROW, run_status: "weird" });
    assert.equal(s.runStatus, "idle");
  });
});

describe("mapThread", () => {
  it("maps session row to thread meta", () => {
    const t = mapThread(SESSION_ROW);
    assert.equal(t.id, "th1");
    assert.equal(t.sessionId, "s1");
    assert.equal(t.workspaceId, "ws1");
    assert.equal(t.runStatus, "running");
    assert.equal(t.pinned, false);
    assert.equal(t.sortOrder, 2);
  });
});

describe("isDefaultWorkspaceRoot", () => {
  it("matches resolved default root", () => {
    assert.equal(isDefaultWorkspaceRoot(getDefaultWorkspaceRoot()), true);
  });

  it("rejects other paths", () => {
    assert.equal(isDefaultWorkspaceRoot("C:\\somewhere-else"), false);
  });
});
