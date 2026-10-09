/**
 * 设置相关 IPC：模型 / 快捷键 / 通用设置的读写，以及通知预览。
 *
 * `settingsGetGeneralSync` 使用 sendSync，供渲染进程首屏同步读取。
 * 通用设置保存后向**其它**窗口广播，供主题 / 语言跨窗同步。
 * 数据目录变更走专用 preview / apply 通道（不即时生效）。
 */
import {
  type AttentionPreviewKind,
  type DataDirChangeRequest,
  type GeneralSettings,
  IpcChannels,
  type ModelSettingsPatch,
  type ShortcutsMap,
} from "@thinker-workbench/shared";
import fs from "node:fs";
import { BrowserWindow, dialog, type IpcMain } from "electron";
import { applyDataDirChange, previewDataDirChange } from "../config/dataDirMigrate";
import {
  getGeneralSettings,
  getPublicModelSettings,
  getShortcutsSettings,
  saveGeneralSettings,
  saveModelSettings,
  saveShortcutsSettings,
} from "../config/settingsStore";
import {
  clearShortcutRecording,
  setShortcutRecording,
} from "../config/shortcutRecording";
import { previewAttention } from "../notify/agentAttention";

/** 已挂过 destroyed 清理的 webContents，避免重复 once。 */
const recordingCleanupBound = new Set<number>();

/**
 * 注册设置通道。
 * @param options.onGeneralSaved 通用设置落盘后回调（同步托盘、窗口背景等）
 * @param options.onDataDirApplied 数据目录切换并迁移完成后回调（重开 DB / 日志）
 */
export function registerSettingsHandlers(
  ipcMain: IpcMain,
  options?: {
    onGeneralSaved?: (general: GeneralSettings) => void;
    onDataDirApplied?: (general: GeneralSettings) => void;
  },
): void {
  ipcMain.handle(IpcChannels.settingsGetModel, () => getPublicModelSettings());
  ipcMain.handle(IpcChannels.settingsSetModel, (_evt, patch: ModelSettingsPatch) => {
    return saveModelSettings(patch ?? {});
  });
  ipcMain.handle(IpcChannels.settingsGetShortcuts, () => getShortcutsSettings());
  ipcMain.handle(IpcChannels.settingsSetShortcuts, (_evt, patch: Partial<ShortcutsMap>) => {
    return saveShortcutsSettings(patch ?? {});
  });
  // 录制中：主进程跳过 reload；窗口销毁时清掉标记
  ipcMain.on(IpcChannels.settingsShortcutRecording, (evt, active: unknown) => {
    const id = evt.sender.id;
    setShortcutRecording(id, Boolean(active));
    if (!recordingCleanupBound.has(id)) {
      recordingCleanupBound.add(id);
      evt.sender.once("destroyed", () => {
        clearShortcutRecording(id);
        recordingCleanupBound.delete(id);
      });
    }
  });
  ipcMain.handle(IpcChannels.settingsGetGeneral, () => getGeneralSettings());
  // 同步通道：首屏恢复主题/语言等，避免闪烁
  ipcMain.on(IpcChannels.settingsGetGeneralSync, (event) => {
    event.returnValue = getGeneralSettings();
  });
  ipcMain.handle(IpcChannels.settingsSetGeneral, (evt, patch: Partial<GeneralSettings>) => {
    const next = saveGeneralSettings(patch ?? {});
    options?.onGeneralSaved?.(next);
    const senderId = evt.sender.id;
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed() || w.webContents.id === senderId) continue;
      w.webContents.send(IpcChannels.settingsGeneralChanged, next);
    }
    return next;
  });
  ipcMain.handle(IpcChannels.settingsPreviewAttention, (_evt, kind: AttentionPreviewKind) => {
    previewAttention(kind === "sound" ? "sound" : "notification");
  });
  ipcMain.handle(
    IpcChannels.settingsPickDirectory,
    async (evt, optionsPick?: { title?: string; defaultPath?: string }) => {
      const win = BrowserWindow.fromWebContents(evt.sender);
      const dialogOpts = {
        title: typeof optionsPick?.title === "string" ? optionsPick.title : undefined,
        defaultPath:
          typeof optionsPick?.defaultPath === "string" ? optionsPick.defaultPath : undefined,
        properties: ["openDirectory", "createDirectory"] as Array<
          "openDirectory" | "createDirectory"
        >,
      };
      const result = win
        ? await dialog.showOpenDialog(win, dialogOpts)
        : await dialog.showOpenDialog(dialogOpts);
      if (result.canceled || !result.filePaths[0]) return null;
      return result.filePaths[0];
    },
  );

  ipcMain.handle(
    IpcChannels.settingsSaveTextFile,
    async (
      evt,
      optionsSave?: {
        content?: string;
        defaultPath?: string;
        title?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      },
    ) => {
      const content = typeof optionsSave?.content === "string" ? optionsSave.content : "";
      const win = BrowserWindow.fromWebContents(evt.sender);
      const dialogOpts = {
        title: typeof optionsSave?.title === "string" ? optionsSave.title : undefined,
        defaultPath:
          typeof optionsSave?.defaultPath === "string" ? optionsSave.defaultPath : undefined,
        filters: Array.isArray(optionsSave?.filters) ? optionsSave.filters : undefined,
      };
      const result = win
        ? await dialog.showSaveDialog(win, dialogOpts)
        : await dialog.showSaveDialog(dialogOpts);
      if (result.canceled || !result.filePath) return null;
      fs.writeFileSync(result.filePath, content, "utf8");
      return result.filePath;
    },
  );

  ipcMain.handle(IpcChannels.settingsPreviewDataDirChange, (_evt, dataDir: string) => {
    return previewDataDirChange(typeof dataDir === "string" ? dataDir : "");
  });

  ipcMain.handle(
    IpcChannels.settingsApplyDataDirChange,
    (evt, request: DataDirChangeRequest) => {
      const sender = evt.sender;
      const result = applyDataDirChange(
        {
          dataDir: typeof request?.dataDir === "string" ? request.dataDir : "",
          migrate: Boolean(request?.migrate),
        },
        {
          onProgress: (progress) => {
            if (!sender.isDestroyed()) {
              sender.send(IpcChannels.settingsDataDirMigrateProgress, progress);
            }
          },
          reopen: () => {
            options?.onDataDirApplied?.(getGeneralSettings());
          },
        },
      );
      if (result.ok && result.general) {
        const senderId = sender.id;
        for (const w of BrowserWindow.getAllWindows()) {
          if (w.isDestroyed() || w.webContents.id === senderId) continue;
          w.webContents.send(IpcChannels.settingsGeneralChanged, result.general);
        }
        options?.onGeneralSaved?.(result.general);
      }
      return result;
    },
  );
}
