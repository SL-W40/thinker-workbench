/**
 * Agent 侧 IPC 宿主：监听主进程 `utility` 通道，驱动 AgentRuntime。
 * runtime 事件以 `kind: "event"` 回推主进程；Trace span 经 `kind: "span"` 上报。
 *
 * 各 handler 见 ./handlers/，共用配置应用见 ./configApply。
 */
import type { McpServerConfig, UtilityToChild } from "@thinker-workbench/shared";
import { resolveHitl } from "../hitl/requestHitl";
import { getMcpManager } from "../mcp/McpManager";
import { type AgentRuntime, createAgentRuntime } from "../runtime/AgentRuntime";
import { handleBrowserEvent } from "./browserClient";
import { applyMcpServers } from "./configApply";
import { handleGitResult } from "./gitClient";
import { onCancel, onCancelTask } from "./handlers/cancel";
import { onCheckpointClear } from "./handlers/checkpoint";
import { onContextUsage } from "./handlers/contextUsage";
import { onHello } from "./handlers/hello";
import { onResume } from "./handlers/resume";
import { onRun } from "./handlers/run";
import type { HostContext } from "./hostContext";
import { getParentPort, postToParent } from "./port";
import { handlePtyEvent } from "./ptyClient";

export class UtilityHost {
  /** 按 checkpointDir 缓存的 runtime：目录即工作区，互不干扰。 */
  private readonly runtimes = new Map<string, AgentRuntime>();
  /** 处理器共用依赖（懒创建 runtime / 取消）。 */
  private readonly ctx: HostContext;

  constructor() {
    this.ctx = {
      ensureRuntime: (checkpointDir?: string) => this.ensureRuntime(checkpointDir),
      listRuntimes: () => [...this.runtimes.values()],
      cancel: (runId: string) => {
        for (const runtime of this.runtimes.values()) {
          runtime.cancel(runId);
        }
      },
    };
  }

  /** 绑定 parentPort，并通知主进程本进程已就绪。 */
  start(): void {
    const port = getParentPort();
    if (!port) {
      throw new Error("Agent entry must run inside Electron utilityProcess.");
    }

    getMcpManager().setStatusListener((status) => {
      postToParent({ channel: "utility", kind: "mcpStatus", status });
    });

    port.on("message", (event) => {
      void this.onMessage(event.data as UtilityToChild);
    });

    process.once("exit", () => {
      void getMcpManager().stopAll();
    });

    postToParent({ channel: "utility", kind: "ready" });
  }

  /**
   * 懒创建 AgentRuntime，并把事件总线接到 parentPort。
   * 按 checkpointDir 缓存：目录由 run / resume 按工作区下发，故可多工作区并存。
   */
  private ensureRuntime(checkpointDir?: string): AgentRuntime {
    const key = checkpointDir?.trim() || "";
    const existing = this.runtimes.get(key);
    if (existing) return existing;
    const runtime = createAgentRuntime({ checkpointDir: key || undefined });
    runtime.events.subscribe((event) => {
      postToParent({ channel: "utility", kind: "event", event });
    });
    this.runtimes.set(key, runtime);
    return runtime;
  }

  private async onMessage(message: UtilityToChild): Promise<void> {
    if (message?.channel !== "utility") return;

    switch (message.kind) {
      case "hello":
        return onHello(this.ctx, message);
      case "run":
        return onRun(this.ctx, message);
      case "cancel":
        return onCancel(this.ctx, message);
      case "cancelTask":
        return onCancelTask(message);
      case "resume":
        return onResume(this.ctx, message);
      case "contextUsage":
        return onContextUsage(message);
      case "checkpointClear":
        return onCheckpointClear(this.ctx, message);
      case "ptyEvent":
        handlePtyEvent(message);
        return;
      case "browserEvent":
        handleBrowserEvent(message);
        return;
      case "gitResult":
        handleGitResult(message);
        return;
      case "hitlResult":
        resolveHitl(message.response);
        return;
      case "mcpReload":
        return applyMcpServers(message.mcpServers as McpServerConfig[] | undefined);
      default: {
        const _exhaustive: never = message;
        void _exhaustive;
        return;
      }
    }
  }
}
