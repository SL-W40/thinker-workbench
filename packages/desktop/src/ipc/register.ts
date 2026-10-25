/**
 * IPC 注册入口：汇总窗口、Agent、设置、session 四类 handler。
 *
 * 须在 createWindow 之前调用，以便首帧同步 session / 通用设置恢复可用。
 */
import type { GeneralSettings } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import type { AgentBridge } from "../utility/AgentBridge";
import { registerAgentHandlers } from "./agentHandlers";
import { registerBrowserHandlers } from "./browserHandlers";
import { registerCheckpointHandlers } from "./checkpointHandlers";
import { registerCustomizeHandlers } from "./customizeHandlers";
import { registerGitHandlers } from "./gitHandlers";
import { registerMcpHandlers } from "./mcpHandlers";
import { registerSessionHandlers } from "./sessionHandlers";
import { registerSettingsHandlers } from "./settingsHandlers";
import { registerTerminalHandlers } from "./terminalHandlers";
import { registerToolsHandlers } from "./toolsHandlers";
import { registerTraceHandlers } from "./traceHandlers";
import { registerUpdateHandlers } from "./updateHandlers";
import { registerWindowHandlers } from "./windowHandlers";
import { registerWorkspaceFsHandlers } from "./workspaceFsHandlers";
import { registerWorkspacesHandlers } from "./workspacesHandlers";

/**
 * 在 ipcMain 上注册全部桌面通道。
 * @param ipcMain Electron IpcMain
 * @param bridge 与 agent utilityProcess 的桥接
 * @param options.onGeneralSaved 通用设置保存后的副作用（托盘 / 窗口背景等）
 * @param options.onDataDirApplied 数据目录切换后的副作用（重开 DB / session / 日志）
 */
export function registerIpc(
  ipcMain: IpcMain,
  bridge: AgentBridge,
  options?: {
    onGeneralSaved?: (general: GeneralSettings) => void;
    onDataDirApplied?: (general: GeneralSettings) => void;
  },
): void {
  registerWindowHandlers(ipcMain);
  registerWorkspacesHandlers(ipcMain, bridge);
  registerWorkspaceFsHandlers(ipcMain);
  // Git 写操作（暂存 / 提交 / 放弃 / 分支 / 远端）
  registerGitHandlers(ipcMain);
  // Checkpoint：保留策略 + 变更处置（回滚 / 采纳）
  registerCheckpointHandlers(ipcMain);
  registerAgentHandlers(ipcMain, bridge);
  registerTerminalHandlers(ipcMain);
  registerBrowserHandlers(ipcMain);
  registerTraceHandlers(ipcMain);
  // Customize：skills / rules / agents
  registerCustomizeHandlers(ipcMain, bridge);
  registerMcpHandlers(ipcMain, bridge);
  registerSettingsHandlers(ipcMain, {
    onGeneralSaved: options?.onGeneralSaved,
    onDataDirApplied: options?.onDataDirApplied,
  });
  registerSessionHandlers(ipcMain);
  registerToolsHandlers(ipcMain);
  // 桌面自动更新（GitHub Releases / electron-updater；dev 下为禁用态）
  registerUpdateHandlers(ipcMain);
}
