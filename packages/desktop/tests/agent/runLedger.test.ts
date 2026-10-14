/**
 * RunLedger：准入提交、FIFO 排队、派发失败、退出结算。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type ChatSessionRecord,
  DEFAULT_MAX_PARALLEL_RUNS,
  type SessionRunStatus,
} from "@thinker-workbench/shared";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  maxParallelRuns: 3,
  maxQueuedRuns: 8,
  queueTimeoutMin: 0,
}));

vi.mock("../../src/config/settingsStore", () => ({
  getGeneralSettings: () => settings,
}));

vi.mock("../../src/ipc/workspacesHandlers", () => ({
  broadcastThreadsChanged: vi.fn(),
}));

vi.mock("../../src/ipc/mcpHandlers", () => ({
  flushPendingMcpReload: vi.fn(),
}));

vi.mock("../../src/notify/hitlNotify", () => ({
  clearHitlForRun: vi.fn(),
}));

vi.mock("../../src/utility/reclaimRunResources", () => ({
  reclaimRunResources: vi.fn(),
}));

vi.mock("../../src/agent/resourceGovernor", () => ({
  releaseBrowserLease: vi.fn(),
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
    upsertSessionForRun: vi.fn(),
    setSessionRunStatus: vi.fn(),
    finalizeOrphanPendingMessages: vi.fn(),
  };
});

import { queueTimeoutError } from "../../src/agent/runCoordinator";
import { acceptedRunResult, runLedger } from "../../src/agent/runLedger";
import * as workspacesStore from "../../src/db/workspacesStore";
import { reclaimRunResources } from "../../src/utility/reclaimRunResources";

const sessions = new Map<string, ChatSessionRecord>();

function seed(id: string, runStatus: SessionRunStatus = "idle"): void {
  sessions.set(id, {
    id,
    threadId: `thr-${id}`,
    workspaceId: "ws-1",
    title: id,
    pinned: false,
    sortOrder: 0,
    runStatus,
    activeRunId: null,
    interruptReason: null,
    createdAt: 0,
    updatedAt: 0,
  });
}

function runningCount(): number {
  let n = 0;
  for (const session of sessions.values()) {
    if (session.runStatus === "running") n += 1;
  }
  return n;
}

describe("RunLedger", () => {
  let registeredRoot: string;

  beforeEach(() => {
    registeredRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tw-ledger-"));
    sessions.clear();
    seed("sess-1");
    settings.maxParallelRuns = DEFAULT_MAX_PARALLEL_RUNS;
    settings.maxQueuedRuns = 8;
    settings.queueTimeoutMin = 0;
    vi.mocked(workspacesStore.getSession).mockImplementation(
      (id: string) => sessions.get(id) ?? null,
    );
    vi.mocked(workspacesStore.getSessionByActiveRunId).mockImplementation((runId: string) => {
      for (const session of sessions.values()) {
        if (session.activeRunId === runId) return session;
      }
      return null;
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
    vi.mocked(workspacesStore.countRunningSessions).mockImplementation(runningCount);
    vi.mocked(workspacesStore.upsertSessionForRun).mockImplementation((opts) => {
      const existing = [...sessions.values()].find((session) => session.threadId === opts.threadId);
      if (!existing) throw new Error(`missing session for ${opts.threadId}`);
      existing.runStatus = opts.runStatus ?? "running";
      existing.activeRunId = opts.activeRunId ?? null;
      existing.interruptReason = opts.interruptReason ?? null;
      return { ...existing };
    });
    vi.mocked(workspacesStore.setSessionRunStatus).mockImplementation((id, status, opts) => {
      const session = sessions.get(id);
      if (!session) return;
      session.runStatus = status;
      if (opts && "activeRunId" in opts) session.activeRunId = opts.activeRunId ?? null;
      if (opts && "interruptReason" in opts) session.interruptReason = opts.interruptReason ?? null;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    runLedger.discardForTests();
    vi.clearAllMocks();
    try {
      fs.rmSync(registeredRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("未触顶时直接 running，并返回 accepted", () => {
    const begun = runLedger.begin({ sessionId: "sess-1", titleHint: "hi" });
    assert.equal(begun.ok, true);
    if (!begun.ok) return;
    assert.equal(begun.queued, undefined);
    assert.equal(runLedger.getPhase(begun.runId), "running");
    assert.equal(workspacesStore.upsertSessionForRun.mock.calls[0]?.[0]?.runStatus, "running");
    assert.equal(workspacesStore.upsertSessionForRun.mock.calls[0]?.[0]?.activeRunId, begun.runId);
    const accepted = acceptedRunResult(begun);
    assert.equal(accepted.ok, true);
    if (accepted.ok) {
      assert.equal(accepted.accepted, true);
      assert.equal(accepted.queued, undefined);
    }
  });

  it("派发失败 settle failed 并清空 activeRunId", () => {
    const begun = runLedger.begin({ sessionId: "sess-1" });
    assert.equal(begun.ok, true);
    if (!begun.ok) return;
    runLedger.dispatchFailed(begun.runId, "ready timeout");
    assert.equal(workspacesStore.setSessionRunStatus.mock.calls.at(-1)?.[1], "failed");
    assert.equal(workspacesStore.setSessionRunStatus.mock.calls.at(-1)?.[2]?.activeRunId, null);
    assert.equal(runLedger.getOpen(begun.runId), undefined);
  });

  it("重复 settle 幂等", () => {
    const begun = runLedger.begin({ sessionId: "sess-1" });
    assert.equal(begun.ok, true);
    if (!begun.ok) return;
    assert.equal(runLedger.settle(begun.runId, "done"), true);
    assert.equal(runLedger.settle(begun.runId, "failed", { error: "late" }), false);
    const statuses = vi.mocked(workspacesStore.setSessionRunStatus).mock.calls.map((c) => c[1]);
    assert.deepEqual(statuses, ["idle"]);
  });

  it("未派发时 cancel 本地 settle cancelled", () => {
    const begun = runLedger.begin({ sessionId: "sess-1" });
    assert.equal(begun.ok, true);
    if (!begun.ok) return;
    const r = runLedger.requestCancel({ sessionId: "sess-1" });
    assert.equal(r.ok, true);
    assert.equal(workspacesStore.setSessionRunStatus.mock.calls.at(-1)?.[1], "cancelled");
    assert.ok(vi.mocked(reclaimRunResources).mock.calls.length > 0);
  });

  it("settleAllOnExit 只把 running 标为 crashed，排队项留下", () => {
    settings.maxParallelRuns = 1;
    seed("sess-2");
    const running = runLedger.begin({ sessionId: "sess-1" });
    const queued = runLedger.begin({ sessionId: "sess-2" });
    assert.equal(running.ok && queued.ok, true);
    if (!running.ok || !queued.ok) return;
    runLedger.markDispatched(running.runId);
    runLedger.settleAllOnExit("Agent utilityProcess exited (1).");
    assert.equal(sessions.get("sess-1")?.runStatus, "crashed");
    assert.equal(runLedger.getOpen(running.runId), undefined);
    assert.equal(runLedger.getPhase(queued.runId), "queued");
    assert.equal(sessions.get("sess-2")?.runStatus, "queued");
  });

  it("触顶后按 seq 出队，队列非空时新请求不能插队", () => {
    settings.maxParallelRuns = 1;
    seed("sess-2");
    seed("sess-3");
    seed("sess-4");
    const first = runLedger.begin({ sessionId: "sess-1" });
    const second = runLedger.begin({ sessionId: "sess-2" });
    const third = runLedger.begin({ sessionId: "sess-3" });
    assert.equal(first.ok && second.ok && third.ok, true);
    if (!first.ok || !second.ok || !third.ok) return;
    assert.equal(runLedger.getPhase(first.runId), "running");
    assert.equal(second.queued, true);
    assert.equal(second.queuePosition, 1);
    assert.equal(third.queuePosition, 2);

    settings.maxParallelRuns = 2;
    const fourth = runLedger.begin({ sessionId: "sess-4" });
    assert.equal(fourth.ok, true);
    if (!fourth.ok) return;
    assert.equal(runLedger.getPhase(second.runId), "running");
    assert.equal(fourth.queued, true);
    assert.equal(runLedger.queuePosition("sess-4"), 2);
    assert.equal(runLedger.getPhase(third.runId), "queued");
    assert.equal(runLedger.queuePosition("sess-3"), 1);
  });

  it("运行结束只升格队头", () => {
    settings.maxParallelRuns = 1;
    seed("sess-2");
    seed("sess-3");
    const first = runLedger.begin({ sessionId: "sess-1" });
    const second = runLedger.begin({ sessionId: "sess-2" });
    const third = runLedger.begin({ sessionId: "sess-3" });
    assert.equal(first.ok && second.ok && third.ok, true);
    if (!first.ok || !second.ok || !third.ok) return;
    runLedger.settle(first.runId, "done");
    assert.equal(runLedger.getPhase(second.runId), "running");
    assert.equal(runLedger.getPhase(third.runId), "queued");
    assert.equal(runLedger.queuePosition("sess-3"), 1);
  });

  it("队列满时拒绝，会话保持 idle", () => {
    settings.maxParallelRuns = 1;
    settings.maxQueuedRuns = 1;
    seed("sess-2");
    seed("sess-3");
    assert.equal(runLedger.begin({ sessionId: "sess-1" }).ok, true);
    const queued = runLedger.begin({ sessionId: "sess-2" });
    assert.equal(queued.ok, true);
    const rejected = runLedger.begin({ sessionId: "sess-3" });
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.match(rejected.error, /Too many queued sessions \(max 1\)/);
    assert.equal(sessions.get("sess-3")?.runStatus, "idle");
  });

  it("深度为 0 时超限仍直接拒绝", () => {
    settings.maxParallelRuns = 1;
    settings.maxQueuedRuns = 0;
    seed("sess-2");
    assert.equal(runLedger.begin({ sessionId: "sess-1" }).ok, true);
    const rejected = runLedger.begin({ sessionId: "sess-2" });
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.match(rejected.error, /Too many parallel sessions \(max 1\)/);
  });

  it("取消排队不影响正在跑的会话和后面的排队项", () => {
    settings.maxParallelRuns = 1;
    seed("sess-2");
    seed("sess-3");
    const running = runLedger.begin({ sessionId: "sess-1" });
    const queued = runLedger.begin({ sessionId: "sess-2" });
    const later = runLedger.begin({ sessionId: "sess-3" });
    assert.equal(running.ok && queued.ok && later.ok, true);
    if (!running.ok || !queued.ok || !later.ok) return;
    const cancelled = runLedger.requestCancel({ sessionId: "sess-2" });
    assert.equal(cancelled.ok, true);
    assert.equal(runLedger.getPhase(running.runId), "running");
    assert.equal(sessions.get("sess-1")?.runStatus, "running");
    assert.equal(runLedger.getOpen(queued.runId), undefined);
    assert.equal(sessions.get("sess-2")?.runStatus, "cancelled");
    assert.equal(runLedger.getPhase(later.runId), "queued");
    assert.equal(runLedger.queuePosition("sess-3"), 1);
  });

  it("排队超时失败后，空槽出来时继续后面的", () => {
    settings.maxParallelRuns = 1;
    settings.queueTimeoutMin = 10;
    vi.useFakeTimers();
    seed("sess-2");
    seed("sess-3");
    const running = runLedger.begin({ sessionId: "sess-1" });
    const firstQueued = runLedger.begin({ sessionId: "sess-2" });
    settings.queueTimeoutMin = 0;
    const secondQueued = runLedger.begin({ sessionId: "sess-3" });
    assert.equal(running.ok && firstQueued.ok && secondQueued.ok, true);
    if (!running.ok || !firstQueued.ok || !secondQueued.ok) return;
    vi.advanceTimersByTime(10 * 60_000);
    assert.equal(runLedger.getOpen(firstQueued.runId), undefined);
    assert.equal(sessions.get("sess-2")?.runStatus, "failed");
    assert.match(sessions.get("sess-2")?.interruptReason ?? "", /timed out/);
    assert.equal(queueTimeoutError(10), sessions.get("sess-2")?.interruptReason);
    assert.equal(runLedger.getPhase(secondQueued.runId), "queued");
    assert.deepEqual(vi.mocked(workspacesStore.finalizeOrphanPendingMessages).mock.calls[0], [
      "ws-1",
      "sess-2",
      queueTimeoutError(10),
      "failed",
    ]);
    runLedger.settle(running.runId, "done");
    assert.equal(runLedger.getPhase(secondQueued.runId), "running");
  });

  it("升格时会话已不在则跳过，并继续下一条", () => {
    settings.maxParallelRuns = 1;
    seed("sess-2");
    seed("sess-3");
    const running = runLedger.begin({ sessionId: "sess-1" });
    const missing = runLedger.begin({ sessionId: "sess-2" });
    const next = runLedger.begin({ sessionId: "sess-3" });
    assert.equal(running.ok && missing.ok && next.ok, true);
    if (!running.ok || !missing.ok || !next.ok) return;
    sessions.delete("sess-2");
    runLedger.settle(running.runId, "done");
    assert.equal(runLedger.getOpen(missing.runId), undefined);
    assert.equal(runLedger.getPhase(next.runId), "running");
  });

  it("同一会话第二次 begin 被拒绝", () => {
    const first = runLedger.begin({ sessionId: "sess-1" });
    assert.equal(first.ok, true);
    const again = runLedger.begin({ sessionId: "sess-1" });
    assert.equal(again.ok, false);
    if (again.ok) return;
    assert.match(again.error, /already has a running agent/);
  });

  it("排队中的会话不能再入队", () => {
    settings.maxParallelRuns = 1;
    seed("sess-2");
    assert.equal(runLedger.begin({ sessionId: "sess-1" }).ok, true);
    assert.equal(runLedger.begin({ sessionId: "sess-2" }).ok, true);
    const again = runLedger.begin({ sessionId: "sess-2" });
    assert.equal(again.ok, false);
    if (again.ok) return;
    assert.match(again.error, /already has a running agent/);
  });

  it("调高并行上限会 pump 队头", () => {
    settings.maxParallelRuns = 1;
    seed("sess-2");
    const running = runLedger.begin({ sessionId: "sess-1" });
    const queued = runLedger.begin({ sessionId: "sess-2" });
    assert.equal(running.ok && queued.ok, true);
    if (!queued.ok) return;
    assert.equal(runLedger.getPhase(queued.runId), "queued");
    settings.maxParallelRuns = 2;
    runLedger.pump();
    assert.equal(runLedger.getPhase(queued.runId), "running");
    assert.equal(sessions.get("sess-2")?.runStatus, "running");
  });

  it("派发失败会把空槽让给队头", () => {
    settings.maxParallelRuns = 1;
    seed("sess-2");
    const running = runLedger.begin({ sessionId: "sess-1" });
    const queued = runLedger.begin({ sessionId: "sess-2" });
    assert.equal(running.ok && queued.ok, true);
    if (!running.ok || !queued.ok) return;
    runLedger.dispatchFailed(running.runId, "spawn failed");
    assert.equal(runLedger.getPhase(queued.runId), "running");
  });
});
