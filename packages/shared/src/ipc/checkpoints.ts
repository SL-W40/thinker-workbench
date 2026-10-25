/**
 * Checkpoint 相关的契约：保留策略 + 变更条目处置（回滚 / 采纳）。
 *
 * 保留策略此前只能在 DevTools 控制台调用，这里把它提升为正式 IPC 面。
 * 「running run / pending-resume run / 每会话最新 run」三类永不裁剪，是硬例外。
 */

/** 保留策略阈值（严格者胜：任一维度超限即触发裁剪）。 */
export type CheckpointRetention = {
  /** 单工作区保留的 run 数上限。 */
  maxRuns: number;
  /** 保留天数上限；0 表示不按时间裁剪。 */
  maxAgeDays: number;
  /** 单工作区 before-image 总字节上限。 */
  maxTotalBytes: number;
  /** 单文件纳入快照的字节上限（超限记 skipped）。 */
  maxFileBytes: number;
};

/** 默认阈值（与 README 记录一致：30 轮 / 14 天 / 256MB / 5MB）。 */
export const DEFAULT_CHECKPOINT_RETENTION: CheckpointRetention = {
  maxRuns: 30,
  maxAgeDays: 14,
  maxTotalBytes: 256 * 1024 * 1024,
  maxFileBytes: 5 * 1024 * 1024,
};

/** 阈值可调范围（UI 步进与校验同源）。 */
export const CHECKPOINT_RETENTION_RANGES = {
  maxRuns: { min: 1, max: 200 },
  maxAgeDays: { min: 0, max: 365 },
} as const;

/** 当前占用统计（设置页展示，不含明细）。 */
export type CheckpointStats = {
  /** run 级快照数。 */
  runCount: number;
  /** before-image 占用字节。 */
  totalBytes: number;
  /** 最旧快照时间；无快照时为 null。 */
  oldestAt: number | null;
};

/** 裁剪结果。 */
export type CheckpointPruneResult = {
  ok: boolean;
  /** 实际删除的 run 数。 */
  removedRuns: number;
  /** 释放的字节。 */
  freedBytes: number;
  /** 因硬例外保留的 run 数。 */
  keptRuns: number;
  error?: string;
};

/** ---- 变更处置（Changes 面板行级操作） ---- */

/** 单文件的处置方式。 */
export type ChangeDispositionKind = "revert" | "keep";

/** 回滚采用的实际恢复策略（UI 展示「怎么退回去的」）。 */
export type ChangeRevertStrategy = "before-image" | "git" | "none";

/** 单文件处置结果。 */
export type ChangeItemResult = {
  path: string;
  ok: boolean;
  /** rollback 的恢复来源；`keep` 恒为 `none`。 */
  strategy: ChangeRevertStrategy;
  error?: string;
};

/** 批量处置入参。 */
export type ChangeDispositionInput = {
  workspaceId: string;
  kind: ChangeDispositionKind;
  /** 相对路径列表；不得为空。 */
  paths: string[];
  /**
   * 限定回滚来源的 run id；省略表示取最新可用 before-image。
   * `keep` 不需要该字段（只丢弃快照记录）。
   */
  runId?: string;
};

/** 批量处置结果。 */
export type ChangeDispositionResult = {
  ok: boolean;
  items: ChangeItemResult[];
  error?: string;
};

/** Preload 暴露的 Checkpoint API。 */
export type ThinkerCheckpointsApi = {
  getRetention(workspaceId: string): Promise<CheckpointRetention>;
  setRetention(
    workspaceId: string,
    patch: Partial<CheckpointRetention>,
  ): Promise<CheckpointRetention>;
  getStats(workspaceId: string): Promise<CheckpointStats>;
  pruneNow(workspaceId: string): Promise<CheckpointPruneResult>;
  /** 变更处置（单文件 / 批量回滚或采纳）。 */
  applyDisposition(input: ChangeDispositionInput): Promise<ChangeDispositionResult>;
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** 字节数校验：非负有限整数，非法回退到默认。 */
function normalizeBytes(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** 保留策略归一：缺字段走默认，越界钳制（UI 与落盘共用同一口径）。 */
export function normalizeCheckpointRetention(
  value: Partial<CheckpointRetention> | null | undefined,
): CheckpointRetention {
  const base = DEFAULT_CHECKPOINT_RETENTION;
  if (!value) return { ...base };
  return {
    maxRuns: clampInt(
      value.maxRuns,
      base.maxRuns,
      CHECKPOINT_RETENTION_RANGES.maxRuns.min,
      CHECKPOINT_RETENTION_RANGES.maxRuns.max,
    ),
    maxAgeDays: clampInt(
      value.maxAgeDays,
      base.maxAgeDays,
      CHECKPOINT_RETENTION_RANGES.maxAgeDays.min,
      CHECKPOINT_RETENTION_RANGES.maxAgeDays.max,
    ),
    maxTotalBytes: normalizeBytes(value.maxTotalBytes, base.maxTotalBytes),
    maxFileBytes: normalizeBytes(value.maxFileBytes, base.maxFileBytes),
  };
}
