/**
 * Checkpoint API 封装：保留策略与变更处置。
 * 桥接不可用时返回保守结果（默认策略 / 失败回执），不让 UI 崩。
 */
import type {
  ChangeDispositionInput,
  ChangeDispositionResult,
  CheckpointPruneResult,
  CheckpointRetention,
  CheckpointStats,
} from "@thinker-workbench/shared";
import { DEFAULT_CHECKPOINT_RETENTION } from "@thinker-workbench/shared";

function api() {
  return window.thinker?.checkpoints;
}

/** 读取保留策略。 */
export async function getCheckpointRetention(workspaceId: string): Promise<CheckpointRetention> {
  const res = await api()?.getRetention(workspaceId);
  return res ?? { ...DEFAULT_CHECKPOINT_RETENTION };
}

/** 写入保留策略补丁。 */
export async function setCheckpointRetention(
  workspaceId: string,
  patch: Partial<CheckpointRetention>,
): Promise<CheckpointRetention> {
  const res = await api()?.setRetention(workspaceId, patch);
  return res ?? { ...DEFAULT_CHECKPOINT_RETENTION, ...patch };
}

/** 读取占用统计。 */
export async function getCheckpointStats(workspaceId: string): Promise<CheckpointStats> {
  const res = await api()?.getStats(workspaceId);
  return res ?? { runCount: 0, totalBytes: 0, oldestAt: null };
}

/** 立即按策略裁剪。 */
export async function pruneCheckpoints(workspaceId: string): Promise<CheckpointPruneResult> {
  const res = await api()?.pruneNow(workspaceId);
  return res ?? { ok: false, removedRuns: 0, freedBytes: 0, keptRuns: 0, error: "桥接不可用" };
}

/** 变更处置（回滚 / 采纳）。 */
export async function applyChangeDisposition(
  input: ChangeDispositionInput,
): Promise<ChangeDispositionResult> {
  const res = await api()?.applyDisposition(input);
  return res ?? { ok: false, items: [], error: "桥接不可用" };
}
