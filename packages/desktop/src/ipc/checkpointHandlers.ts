/**
 * Checkpoint IPC：保留策略读写、占用统计、立即裁剪，以及变更条目处置。
 */
import type { ChangeDispositionInput, CheckpointRetention } from "@thinker-workbench/shared";
import { IpcChannels } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { applyChangeDisposition } from "../checkpoint/changeDisposition";
import { getRetention, getStats, pruneNow, setRetention } from "../checkpoint/retention";
import { desktopLog } from "../log/setup";

const log = desktopLog("checkpointHandlers");

/** 注册 Checkpoint 相关通道。 */
export function registerCheckpointHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.checkpointsRetentionGet, async (_e, workspaceId: string) =>
    guard(() => getRetention(String(workspaceId ?? "")), { ...defaultRetentionFallback() }),
  );

  ipcMain.handle(
    IpcChannels.checkpointsRetentionSet,
    async (_e, payload: { workspaceId: string; patch: Partial<CheckpointRetention> }) =>
      guard(() => setRetention(String(payload?.workspaceId ?? ""), payload?.patch ?? {})),
  );

  ipcMain.handle(IpcChannels.checkpointsStats, async (_e, workspaceId: string) =>
    guard(() => getStats(String(workspaceId ?? ""))),
  );

  ipcMain.handle(IpcChannels.checkpointsPruneNow, async (_e, workspaceId: string) =>
    guard(() => pruneNow(String(workspaceId ?? ""))),
  );

  ipcMain.handle(IpcChannels.changesDisposition, async (_e, input: ChangeDispositionInput) =>
    guard(() => applyChangeDisposition(input)),
  );
}

/** 统一异常处理：把异常转成 IPC 里的失败回执，不让 renderer 收到 rejected promise。 */
async function guard<T>(
  work: () => Promise<T>,
  fallback?: T,
): Promise<T | { ok: false; error: string }> {
  try {
    return await work();
  } catch (err) {
    log.warn("Checkpoint IPC 处理失败", { error: String(err) });
    if (fallback !== undefined) return fallback as T;
    return { ok: false, error: String(err) } as { ok: false; error: string };
  }
}

/** 读不到策略时的兜底（与 shared 默认值保持一致）。 */
function defaultRetentionFallback(): CheckpointRetention {
  return {
    maxRuns: 30,
    maxAgeDays: 14,
    maxTotalBytes: 256 * 1024 * 1024,
    maxFileBytes: 5 * 1024 * 1024,
  };
}
