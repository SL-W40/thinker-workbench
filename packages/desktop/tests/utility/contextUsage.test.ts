/**
 * AgentBridge.getContextUsage：随消息下发真实上下文窗口，失败时返回带原因的快照。
 *
 * 回归点：
 * - 估算走「不解锁密钥」的快照，子进程据此拿不到窗口，必须由主进程下发（否则恒为 128K）；
 * - 任何失败路径都要有明确 error，UI 不能用 0 冒充「没占用」。
 */
import assert from "node:assert/strict";
import type { UtilityToChild } from "@thinker-workbench/shared";
import { describe, it, vi } from "vitest";

/** 子进程替身：记录 postMessage、可回放 ready / 结果。 */
type FakeChild = {
  on: (event: string, cb: (raw: unknown) => void) => void;
  postMessage: (message: UtilityToChild) => void;
};

const state = vi.hoisted(() => ({
  /** 让 postMessage 抛错，验证 send 失败也有回包。 */
  sendFails: false,
  sent: [] as UtilityToChild[],
}));

vi.mock("../../src/agent/runLedger", () => ({
  runLedger: { settleAllOnExit: () => {}, requestCancel: () => {} },
}));
vi.mock("../../src/browser/BrowserSessionManager", () => ({
  browserSessionManager: { releaseLock: async () => {} },
}));
vi.mock("../../src/config/paths", () => ({
  getDataDir: () => "/tmp/thinker-data",
  getWorkspaceCheckpointDir: () => "/tmp/thinker-data/checkpoints",
}));
vi.mock("../../src/config/settingsStore", () => ({
  getGeneralSettings: () => ({
    aiLocale: "zh-CN",
    workspaceAccess: "workspace",
    allowAiDeleteFiles: false,
  }),
  getModelCatalogSnapshot: () => ({ providers: [], models: [], selection: { mode: "auto" } }),
  getModelCatalog: () => ({ providers: [], models: [], selection: { mode: "auto" } }),
  // 与真实实现同形：不解密、返回窗口与 emoji 偏好
  resolvePrimaryModelMeta: () => ({
    apiKey: "",
    baseUrl: "",
    model: "deep-test",
    allowEmoji: true,
    contextWindow: 1_049_000,
  }),
  unlockModelSecretsForRun: () => ({ ok: true }),
}));
vi.mock("../../src/customize/agentsStore", () => ({ listAgents: () => ({ agents: [] }) }));
vi.mock("../../src/db/workspacesStore", () => ({
  getActiveSessionId: () => "s1",
  getSession: () => ({ id: "s1", threadId: "t1" }),
  getSessionByThreadId: () => ({ id: "s1", threadId: "t1" }),
  getSessionModelSelection: () => null,
  getSessionChatMode: () => "agent",
  getWorkspace: () => null,
}));
vi.mock("../../src/log/setup", () => ({
  desktopLog: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));
vi.mock("../../src/terminal/detectShellProfiles", () => ({ shellFactsForAgent: () => ({}) }));
vi.mock("../../src/terminal/TerminalSessionManager", () => ({
  terminalSessionManager: { killByRunId: () => {} },
}));
vi.mock("../../src/trace/writeSpan", () => ({
  startTraceSpan: () => {},
  endTraceSpan: () => {},
}));
vi.mock("../../src/utility/agentHostRequests", () => ({
  handlePtyRequest: () => {},
  handleBrowserRequest: () => {},
  handleGitRequest: () => {},
}));

const { AgentBridge } = await import("../../src/utility/AgentBridge");

/** 造一个 bridge，并按需回放子进程 ready。 */
function makeBridge(options?: { ready?: boolean }) {
  const listeners: Array<(raw: unknown) => void> = [];
  const child: FakeChild = {
    on: (_event, cb) => listeners.push(cb),
    postMessage: (message) => {
      if (state.sendFails) throw new Error("child gone");
      state.sent.push(message);
    },
  };
  const bridge = new AgentBridge();
  bridge.attach(child as never);
  if (options?.ready !== false) {
    for (const cb of listeners) cb({ channel: "utility", kind: "ready" });
  }
  return bridge;
}

/** 取最近一条下发给子进程的消息。 */
function lastSent(): UtilityToChild {
  const last = state.sent.at(-1);
  assert.ok(last, "应有一条下发消息");
  return last;
}

describe("AgentBridge.getContextUsage", () => {
  it("下发真实上下文窗口 / emoji / 会话 ChatMode（子进程拿不到明文 key）", async () => {
    state.sent = [];
    state.sendFails = false;
    const bridge = makeBridge();
    const promise = bridge.getContextUsage({ messages: [] }, 50);
    await promise;

    const msg = lastSent();
    assert.equal(msg.kind, "contextUsage");
    assert.ok(msg.kind === "contextUsage");
    assert.equal(msg.contextWindow, 1_049_000);
    assert.equal(msg.allowEmoji, true);
    assert.equal(msg.chatMode, "agent");
  });

  it("子进程未 ready：返回带原因的快照，且上限仍是真实窗口", async () => {
    state.sendFails = true;
    const bridge = makeBridge({ ready: false });
    const snap = await bridge.getContextUsage({ messages: [] }, 30);
    assert.equal(snap.error, "utility_not_ready");
    assert.equal(snap.limit, 1_049_000);
  });

  it("send 失败：立即回包且带原因，不留 8s 悬空", async () => {
    state.sendFails = true;
    const bridge = makeBridge();
    const snap = await bridge.getContextUsage({ messages: [] }, 5_000);
    assert.equal(snap.error, "utility_not_ready");
    assert.equal(snap.limit, 1_049_000);
  });
});
