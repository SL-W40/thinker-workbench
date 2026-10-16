/**
 * 启动 Agent utilityProcess 并挂接 AgentBridge。
 *
 * fork `packages/engine` 入口；spawn 后发送 hello（checkpoint、model、aiLocale、日志策略）；
 * 异常退出时按 run 回收主进程 PTY，再带退避自动重启并重发 hello。
 */
import type { UtilityHello } from "@thinker-workbench/shared";
import { utilityProcess } from "electron";
import { runLedger } from "../agent/runLedger";
import { getAgentEntryPath, getCheckpointDir, getDataDir } from "../config/paths";
import { getGeneralSettings, getModelCatalogSnapshot } from "../config/settingsStore";
import { listAgents } from "../customize/agentsStore";
import { getActiveWorkspaceRoot } from "../db/workspacesStore";
import { onAgentUtilityExited } from "../ipc/agentHandlers";
import { desktopLog } from "../log/setup";
import { listEnabledMcpConfigs } from "../mcp/mcpStore";
import { shellFactsForAgent } from "../terminal/detectShellProfiles";
import { AgentBridge } from "./AgentBridge";
import { nextAgentRestartDelayMs, shouldScheduleAgentRestart } from "./agentProcessRestart";
import { attachLifecycle } from "./processLifecycle";
import { shellSettingsPayload } from "./shellSettingsPayload";

/** 已启动的 Agent 进程句柄：桥接对象 + 手动重启 / 停机。 */
export type AgentProcessHandle = {
  bridge: AgentBridge;
  /** 立即杀旧进程并重新 spawn（退避计数清零）。 */
  restart: () => void;
  /** 应用退出前调用：取消自动重启并杀掉 utility。 */
  stop: () => void;
};

/** 组装下发给 agent 的 hello 载荷（设置变更时可重发）。 */
export function buildAgentHello(): UtilityHello {
  const general = getGeneralSettings();
  // 启动 hello 不解锁钥匙串；首次 run / probe 再经 getModelCatalog 解密
  const catalog = getModelCatalogSnapshot();
  return {
    channel: "utility",
    kind: "hello",
    checkpointDir: getCheckpointDir(),
    catalog,
    selection: catalog.selection,
    aiLocale: general.aiLocale,
    workspaceAccess: general.workspaceAccess,
    allowAiDeleteFiles: general.allowAiDeleteFiles,
    ...shellSettingsPayload(general, shellFactsForAgent(general.shellProfileId)),
    httpCompatibilityMode: general.httpCompatibilityMode,
    maxAgentSteps: general.maxAgentSteps,
    maxSubagentSteps: general.maxSubagentSteps,
    modelRetryMaxAttempts: general.modelRetryMaxAttempts,
    modelRetryBaseDelayMs: general.modelRetryBaseDelayMs,
    defaultShellBlockUntilMs: general.defaultShellBlockUntilMs,
    shellOutputCap: general.shellOutputCap,
    mcpConnectTimeoutMs: general.mcpConnectTimeoutMs,
    mcpCallTimeoutMs: general.mcpCallTimeoutMs,
    contextFilesMaxFileBytes: general.contextFilesMaxFileBytes,
    contextFilesMaxTotalBytes: general.contextFilesMaxTotalBytes,
    readFileDefaultMaxChars: general.readFileDefaultMaxChars,
    loggingEnabled: general.loggingEnabled,
    trace: { enabled: general.observabilityEnabled !== false },
    workspaceRoot: getActiveWorkspaceRoot() ?? undefined,
    dataDir: getDataDir(),
    mcpServers: listEnabledMcpConfigs(),
    subagents: listAgents(getActiveWorkspaceRoot()).agents,
  };
}

/** 向已运行的 agent 重推 hello（日志策略 / 路径等热更新）。 */
export function pushAgentHello(bridge: AgentBridge): void {
  bridge.send(buildAgentHello());
}

/**
 * 创建 AgentBridge、fork 子进程并返回句柄。
 * 异常退出会自动退避重启；应用退出前须 `stop()`。
 */
export function startAgentProcess(): AgentProcessHandle {
  const bridge = new AgentBridge();
  const log = desktopLog("agent-process");

  let child: Electron.UtilityProcess | null = null;
  /** 当前活着的 spawn 代数；手动 restart/stop 时递增以作废迟到的 exit。 */
  let liveGeneration = 0;
  /** 连续失败重启次数；ready 后清零。 */
  let attempt = 0;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const clearRestartTimer = () => {
    if (!restartTimer) return;
    clearTimeout(restartTimer);
    restartTimer = null;
  };

  const scheduleRestart = () => {
    clearRestartTimer();
    const delayMs = nextAgentRestartDelayMs(attempt);
    attempt += 1;
    log.warn("utility exited; scheduling restart", {
      meta: { delayMs, attempt },
    });
    restartTimer = setTimeout(() => {
      restartTimer = null;
      spawnChild();
    }, delayMs);
  };

  const handleExit = (exitedGeneration: number, code: number | null) => {
    if (exitedGeneration !== liveGeneration) {
      // 已被更新一代取代：勿 markExited，以免拆掉新 child
      return;
    }
    child = null;
    bridge.markExited(code);
    onAgentUtilityExited();
    if (
      !shouldScheduleAgentRestart({
        stopped,
        liveGeneration,
        exitedGeneration,
      })
    ) {
      return;
    }
    scheduleRestart();
  };

  const spawnChild = () => {
    if (stopped) return;
    clearRestartTimer();
    const myGeneration = ++liveGeneration;
    const spawned = spawn(bridge, {
      onExit: (code) => handleExit(myGeneration, code),
      onSpawnError: (error) => {
        log.error("spawn error", { meta: { error: error.message } });
        handleExit(myGeneration, 1);
      },
    });
    child = spawned;
  };

  bridge.onReady(() => {
    if (attempt > 0) {
      log.info("utility ready; restart backoff reset", { meta: { attempt } });
    }
    attempt = 0;
    // 子进程恢复后才把崩溃期间留下的排队项派发出去
    try {
      runLedger.pump();
    } catch {
      /* ignore */
    }
  });

  const restart = () => {
    if (stopped) return;
    attempt = 0;
    clearRestartTimer();
    // 先作废当前代，避免 kill 同步触发的 exit 再排一次自动重启
    liveGeneration += 1;
    const prev = child;
    child = null;
    bridge.markExited(null);
    try {
      prev?.kill();
    } catch {
      // 进程可能已退出，忽略 kill 错误
    }
    spawnChild();
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearRestartTimer();
    liveGeneration += 1;
    const prev = child;
    child = null;
    bridge.markExited(null);
    try {
      prev?.kill();
    } catch {
      /* ignore */
    }
  };

  spawnChild();
  return { bridge, restart, stop };
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
function spawn(
  bridge: AgentBridge,
  handlers: {
    onExit: (code: number | null) => void;
    onSpawnError: (error: Error) => void;
  },
) {
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
    onExit: handlers.onExit,
    onSpawnError: handlers.onSpawnError,
  });

  child.on("spawn", () => {
    // 子进程起来后下发运行时配置（含自动重启后的重发）
    bridge.send(buildAgentHello());
  });

  return child;
}
