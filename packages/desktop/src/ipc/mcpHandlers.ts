/**
 * MCP IPC：配置 CRUD、测试连接、状态广播。
 */
import {
  IpcChannels,
  type McpServerRuntimeStatus,
  type McpServerUpsertInput,
} from "@thinker-workbench/shared";
import { BrowserWindow, dialog, type IpcMain } from "electron";
import type { AgentBridge } from "../utility/AgentBridge";
import { pushAgentHello } from "../utility/startAgentProcess";
import {
  importCursorMcpJson,
  listEnabledMcpConfigs,
  listMcpConfigs,
  removeMcpConfig,
  setMcpEnabled,
  upsertMcpConfig,
} from "../mcp/mcpStore";

/** 缓存 engine 推送的运行时状态。 */
const statusById = new Map<string, McpServerRuntimeStatus>();

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

function reloadMcpOnAgent(bridge: AgentBridge): void {
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

  ipcMain.handle(
    IpcChannels.mcpSetEnabled,
    (_evt, id: string, enabled: boolean) => {
      const cfg = setMcpEnabled(String(id ?? ""), Boolean(enabled));
      reloadMcpOnAgent(bridge);
      return cfg;
    },
  );

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

  ipcMain.handle(IpcChannels.mcpImportCursorFile, async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: "Import Cursor mcp.json",
          filters: [{ name: "JSON", extensions: ["json"] }],
          properties: ["openFile"],
        })
      : await dialog.showOpenDialog({
          title: "Import Cursor mcp.json",
          filters: [{ name: "JSON", extensions: ["json"] }],
          properties: ["openFile"],
        });
    if (result.canceled || !result.filePaths[0]) {
      return { imported: [] as string[], skipped: [] as string[] };
    }
    const out = importCursorMcpJson(result.filePaths[0]);
    reloadMcpOnAgent(bridge);
    return out;
  });
}

function sanitize(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "server";
}
