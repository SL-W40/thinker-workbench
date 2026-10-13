/**
 * MCP IPC：配置 CRUD、测试连接、状态广播。
 */
import {
  IpcChannels,
  type McpServerRuntimeStatus,
  type McpServerUpsertInput,
} from "@thinker-workbench/shared";
import { BrowserWindow, dialog, type IpcMain } from "electron";
import { canReloadMcpNow } from "../agent/resourceGovernor";
import { desktopLog } from "../log/setup";
import {
  importMcpJsonFile,
  listEnabledMcpConfigs,
  listMcpConfigs,
  removeMcpConfig,
  setMcpEnabled,
  upsertMcpConfig,
} from "../mcp/mcpStore";
import type { AgentBridge } from "../utility/AgentBridge";
import { pushAgentHello } from "../utility/startAgentProcess";

/** 缓存 engine 推送的运行时状态。 */
const statusById = new Map<string, McpServerRuntimeStatus>();

/** running 期间延后的 MCP reload。 */
let mcpReloadPending = false;

/** 向所有窗口广播状态。 */
export function broadcastMcpStatus(status: McpServerRuntimeStatus): void {
  statusById.set(status.id, status);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(IpcChannels.mcpStatus, status);
  }
}

/** engine 侧 mcpStatus 入口。 */
export function handleMcpStatusFromAgent(status: McpServerRuntimeStatus): void {
  broadcastMcpStatus(status);
}

/**
 * 有 running 会话时不立刻 reload（避免拆掉在途 MCP 调用），标记待应用；
 * 空闲时立即下发。
 */
function reloadMcpOnAgent(bridge: AgentBridge): void {
  if (!canReloadMcpNow()) {
    mcpReloadPending = true;
    desktopLog("mcp").info("reload deferred: sessions running");
    return;
  }
  flushMcpReload(bridge);
}

/** 在无 running 时冲刷延后的 MCP 配置（可由 agent done 后调用）。 */
export function flushPendingMcpReload(bridge: AgentBridge): void {
  if (!mcpReloadPending) return;
  if (!canReloadMcpNow()) return;
  flushMcpReload(bridge);
}

function flushMcpReload(bridge: AgentBridge): void {
  mcpReloadPending = false;
  const servers = listEnabledMcpConfigs();
  try {
    bridge.send({ channel: "utility", kind: "mcpReload", mcpServers: servers });
  } catch {
    try {
      pushAgentHello(bridge);
    } catch {
      /* agent 未就绪 */
    }
  }
}

/** 注册 MCP 通道。 */
export function registerMcpHandlers(ipcMain: IpcMain, bridge: AgentBridge): void {
  ipcMain.handle(IpcChannels.mcpList, () => {
    const servers = listMcpConfigs();
    const statuses = servers.map(
      (s) =>
        statusById.get(s.id) ??
        ({
          id: s.id,
          state: s.enabled ? "stopped" : "stopped",
        } satisfies McpServerRuntimeStatus),
    );
    return { servers, statuses };
  });

  ipcMain.handle(IpcChannels.mcpUpsert, (_evt, input: McpServerUpsertInput) => {
    const cfg = upsertMcpConfig(input);
    reloadMcpOnAgent(bridge);
    return cfg;
  });

  ipcMain.handle(IpcChannels.mcpRemove, (_evt, id: string) => {
    removeMcpConfig(String(id ?? ""));
    statusById.delete(sanitize(id));
    reloadMcpOnAgent(bridge);
  });

  ipcMain.handle(IpcChannels.mcpSetEnabled, (_evt, id: string, enabled: boolean) => {
    const cfg = setMcpEnabled(String(id ?? ""), Boolean(enabled));
    reloadMcpOnAgent(bridge);
    return cfg;
  });

  ipcMain.handle(IpcChannels.mcpTest, async (_evt, input: McpServerUpsertInput) => {
    // 临时写入再 reload 过重；改为让 engine 用单次配置测试：
    // 首期：若 agent 在线则发仅含该 server 的 mcpReload，再立刻恢复全量。
    const trial: McpServerUpsertInput = {
      ...input,
      id: input.id || "test",
      enabled: true,
    };
    const cfg = {
      id: sanitize(trial.id),
      name: trial.name?.trim() || sanitize(trial.id),
      enabled: true,
      transport: "stdio" as const,
      command: trial.command.trim(),
      args: trial.args ?? [],
      env: trial.env ?? {},
      cwd: trial.cwd ?? null,
    };
    if (!cfg.command) {
      return {
        id: cfg.id,
        state: "error" as const,
        error: "Command is required.",
      };
    }
    try {
      bridge.send({
        channel: "utility",
        kind: "mcpReload",
        mcpServers: [cfg],
      });
      // 等待短时状态；若超时返回 starting
      await new Promise((r) => setTimeout(r, 2500));
      const st = statusById.get(cfg.id);
      reloadMcpOnAgent(bridge);
      return (
        st ?? {
          id: cfg.id,
          state: "starting" as const,
          error: "No status yet; check again in Settings.",
        }
      );
    } catch (err) {
      reloadMcpOnAgent(bridge);
      return {
        id: cfg.id,
        state: "error" as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(IpcChannels.mcpImportFile, async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: "Import mcp.json",
          filters: [{ name: "JSON", extensions: ["json"] }],
          properties: ["openFile"],
        })
      : await dialog.showOpenDialog({
          title: "Import mcp.json",
          filters: [{ name: "JSON", extensions: ["json"] }],
          properties: ["openFile"],
        });
    if (result.canceled || !result.filePaths[0]) {
      return { imported: [] as string[], skipped: [] as string[] };
    }
    const out = importMcpJsonFile(result.filePaths[0]);
    reloadMcpOnAgent(bridge);
    return out;
  });
}

function sanitize(raw: string): string {
  return (
    String(raw ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "server"
  );
}
