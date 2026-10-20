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
  private runtime: AgentRuntime | null = null;
  /** 处理器共用依赖（懒创建 runtime / 取消）。 */
  private readonly ctx: HostContext;

  constructor() {
    this.ctx = {
      ensureRuntime: (checkpointDir?: string) => this.ensureRuntime(checkpointDir),
      cancel: (runId: string) => this.runtime?.cancel(runId),
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
   * 懒创建唯一 AgentRuntime，并把事件总线接到 parentPort。
   * checkpointDir 仅在首次创建时生效。
   */
  private ensureRuntime(checkpointDir?: string): AgentRuntime {
    if (!this.runtime) {
      this.runtime = createAgentRuntime({ checkpointDir });
      this.runtime.events.subscribe((event) => {
        postToParent({ channel: "utility", kind: "event", event });
      });
    }
    return this.runtime;
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
