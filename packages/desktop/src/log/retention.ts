/**
 * 按保留天数清理日志 SQLite 分片（按条数滚动）。
 */
import { getLogDir } from "../config/paths";
import { pruneLogShards } from "./logsDb";
import { desktopLog } from "./setup";

export type PruneLogResult = {
  rewritten: string[];
  kept: number;
  removed: number;
};

/**
 * 按保留天数修剪日志分片。
 * `retentionDays <= 0` 时不做任何事。
 */
export function pruneExpiredLogs(retentionDays: number): PruneLogResult {
  const result: PruneLogResult = { rewritten: [], kept: 0, removed: 0 };
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return result;

  const pruned = pruneLogShards(retentionDays);
  result.rewritten = pruned.removedShards;
  result.removed = pruned.removedShards.length + pruned.removedRows;

  if (result.removed > 0) {
    desktopLog("log.retention").info("pruned", {
      meta: {
        retentionDays,
        logDir: getLogDir(),
        removedShards: pruned.removedShards,
        removedRows: pruned.removedRows,
      },
    });
  }

  return result;
}
