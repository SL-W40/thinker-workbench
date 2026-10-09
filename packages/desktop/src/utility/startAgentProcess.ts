/**
 * 启动 Agent utilityProcess 并挂接 AgentBridge。
 *
 * fork `packages/engine` 入口；spawn 后发送 hello（checkpoint、model、aiLocale、日志策略）；
 * 提供 restart 以便子进程异常后重建。
 */
import type { UtilityHello } from "@thinker-workbench/shared";
import { utilityProcess } from "electron";
import { getAgentEntryPath, getCheckpointDir, getDataDir } from "../config/paths";
import { getGeneralSettings, getModelSettings } from "../config/settingsStore";
import { getActiveWorkspaceRoot } from "../db/workspacesStore";
import { onAgentUtilityExited } from "../ipc/agentHandlers";
import { listEnabledMcpConfigs } from "../mcp/mcpStore";
import { shellFactsForAgent } from "../terminal/detectShellProfiles";
import { AgentBridge } from "./AgentBridge";
import { attachLifecycle } from "./processLifecycle";

/** 已启动的 Agent 进程句柄：桥接对象 + 重启函数。 */
export type AgentProcessHandle = {
  bridge: AgentBridge;
  restart: () => void;
};

/** 组装下发给 agent 的 hello 载荷（设置变更时可重发）。 */
export function buildAgentHello(): UtilityHello {
  const general = getGeneralSettings();
  return {
    channel: "utility",
    kind: "hello",
    checkpointDir: getCheckpointDir(),
    model: getModelSettings(),
    aiLocale: general.aiLocale,
    workspaceAccess: general.workspaceAccess,
    allowAiDeleteFiles: general.allowAiDeleteFiles,
    allowAiShell: general.allowAiShell,
    allowAiBrowser: general.allowAiBrowser,
    shellApprovalMode: general.shellApprovalMode,
    shellAllowlist: general.shellAllowlist,
    shell: shellFactsForAgent(general.shellProfileId),
    logTruncateLongContent: general.logTruncateLongContent,
    loggingEnabled: general.loggingEnabled,
    workspaceRoot: getActiveWorkspaceRoot() ?? undefined,
    dataDir: getDataDir(),
    mcpServers: listEnabledMcpConfigs(),
  };
}

/** 向已运行的 agent 重推 hello（日志策略 / 路径等热更新）。 */
export function pushAgentHello(bridge: AgentBridge): void {
  bridge.send(buildAgentHello());
}

/**
 * 创建 AgentBridge、fork 子进程并返回句柄。
 * @returns bridge 供 IPC 注册；restart 用于杀旧进程并重新 spawn
 */
export function startAgentProcess(): AgentProcessHandle {
  const bridge = new AgentBridge();
  let child = spawn(bridge);

  const restart = () => {
    try {
      child.kill();
    } catch {
      // 进程可能已退出，忽略 kill 错误
    }
    child = spawn(bridge);
  };

  return { bridge, restart };
}

/** 保留 stdout/stderr pipe（排障用）；正式观测走 `@thinker-workbench/logger`。 */
function pipeAgentConsole(child: Electron.UtilityProcess): void {
  child.stdout?.on("data", (chunk: Buffer | string) => {
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    process.stderr.write(chunk);
  });
}

/**
 * fork agent 入口、绑定 bridge 与生命周期，并在 spawn 后发送 hello。
 * @returns 新建的 UtilityProcess
 */
function spawn(bridge: AgentBridge) {
  const entry = getAgentEntryPath();
  const child = utilityProcess.fork(entry, [], {
    serviceName: "thinker-workbench-agent",
    stdio: "pipe",
  });

  pipeAgentConsole(child);
  bridge.attach(child);
  attachLifecycle(child, {
    onReady: () => {
      // ready 由 postMessage 握手在 bridge 内置位
    },
    onExit: (code) => {
      bridge.markExited(code);
      onAgentUtilityExited();
    },
    onSpawnError: (error) => {
      console.error("[agent-process] spawn error", error);
      bridge.markExited(1);
    },
  });

  child.on("spawn", () => {
    // 子进程起来后下发运行时配置
    bridge.send(buildAgentHello());
  });

  return child;
}
