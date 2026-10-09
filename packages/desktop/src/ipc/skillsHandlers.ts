/**
 * Skills IPC：Composer `/` 菜单列表。
 */
import { IpcChannels } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { listSkillSummaries } from "../skills/listSkills";

/** 注册 skills 相关通道。 */
export function registerSkillsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.skillsList, (_evt, workspaceRoot?: string | null) => {
    return listSkillSummaries(
      typeof workspaceRoot === "string" ? workspaceRoot : null,
    );
  });
}
