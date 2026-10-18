/**
 * 历史消息耗时回填（DB 侧）。
 *
 * 背景：老版本把「本轮耗时」交给渲染端用墙钟累加，失败 / 崩溃 / 重启的路径上一路丢字段，
 * 结果大量气泡存成 0ms。现在 `durationMs` 由引擎在终态事件里下发，新数据不会再错，
 * 但**旧数据**仍然缺值。这里在启动时按 `traceId` 关联 trace.db 的 spans 精确回填一次：
 * 一次 run 的墙钟 = 同 traceId 全部 span 的最早 start_ts 到最晚 end_ts。
 *
 * 原则：
 * - 只回填「有 trace 证据」的消息；没有 span 的一律留空（UI 展示「—」），**绝不猜测**。
 * - 幂等：每个 chat.db 用 `schema_meta` 记版本号，跑过就不再跑（`force` 可重跑）。
 * - 失败只记日志，绝不阻塞启动。
 *
 * 纯计算在同目录 `runDurationMath.ts`（不 import 本文件即可单测）。
 */
import type Database from "better-sqlite3";
import { desktopLog } from "../log/setup";
import { openTraceDb } from "../trace/traceDb";
import {
  mergeDurationIntoPayload,
  type SpanWindow,
  traceIdNeedingBackfill,
  wallClockMsFromSpans,
} from "./runDurationMath";
import { openWorkspaceChatDb } from "./thinkerDb";
import { listWorkspaces } from "./workspacesStore";

/** 回填算法版本：算法变了就 +1，标记过的库会重跑一次。 */
export const RUN_DURATION_BACKFILL_VERSION = 1;

/** chat.db `schema_meta` 里的标记键。 */
export const BACKFILL_META_KEY = "runDurationBackfill";

export type DurationBackfillStats = {
  /** 扫描到的助手消息条数。 */
  scanned: number;
  /** 实际写入 durationMs 的条数。 */
  updated: number;
  /** 无 traceId 或无 span，保持未知（UI 展示「—」）的条数。 */
  leftUnknown: number;
};

/** 读已完成的回填版本；0 表示没跑过。 */
function readVersion(db: Database.Database): number {
  try {
    const row = db.prepare("SELECT value FROM schema_meta WHERE key = ?").get(BACKFILL_META_KEY) as
      | { value: string }
      | undefined;
    const parsed = row ? Number.parseInt(row.value, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeVersion(db: Database.Database): void {
  try {
    db.prepare(
      `INSERT INTO schema_meta(key, value) VALUES(?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(BACKFILL_META_KEY, String(RUN_DURATION_BACKFILL_VERSION));
  } catch {
    /* 标记写不进去不影响本次结果，下次启动重跑即可 */
  }
}

/** 一次最多查多少个 traceId，避免 SQL 参数过多。 */
const CHUNK_SIZE = 400;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 按 traceId 批量聚合：「最早开始 → 最晚结束」。 */
function queryDurations(trace: Database.Database, traceIds: string[]): Map<string, number> {
  const byTrace = new Map<string, SpanWindow[]>();
  for (const group of chunk(traceIds, CHUNK_SIZE)) {
    const placeholders = group.map(() => "?").join(",");
    const rows = trace
      .prepare(`SELECT trace_id, start_ts, end_ts FROM spans WHERE trace_id IN (${placeholders})`)
      .all(...group) as Array<{ trace_id: string; start_ts: number; end_ts: number | null }>;
    for (const row of rows) {
      const list = byTrace.get(row.trace_id);
      if (list) list.push({ startTs: row.start_ts, endTs: row.end_ts });
      else byTrace.set(row.trace_id, [{ startTs: row.start_ts, endTs: row.end_ts }]);
    }
  }
  const durations = new Map<string, number>();
  for (const [traceId, spans] of byTrace) {
    const ms = wallClockMsFromSpans(spans);
    if (ms != null) durations.set(traceId, ms);
  }
  return durations;
}

export type BackfillOptions = {
  /** 只处理这些工作空间；省略则全部。 */
  workspaceIds?: string[];
  /** 忽略幂等标记，强制重跑（测试 / 手动修复用）。 */
  force?: boolean;
};

/**
 * 启动时调用：回填所有工作空间里缺 `durationMs` 的历史助手消息。
 * 任何异常都被吞掉并记日志——回填是锦上添花，不能拖垮启动。
 */
export function backfillRunDurations(options: BackfillOptions = {}): DurationBackfillStats {
  const stats: DurationBackfillStats = { scanned: 0, updated: 0, leftUnknown: 0 };
  const workspaceIds = options.workspaceIds?.length
    ? options.workspaceIds
    : listWorkspaces().map((w) => w.id);
  if (workspaceIds.length === 0) return stats;

  let trace: Database.Database;
  try {
    trace = openTraceDb();
  } catch (err) {
    desktopLog("backfill.duration").warn("trace db unavailable", {
      meta: { error: err instanceof Error ? err.message : String(err) },
    });
    return stats;
  }

  for (const workspaceId of workspaceIds) {
    try {
      const db = openWorkspaceChatDb(workspaceId);
      if (!options.force && readVersion(db) >= RUN_DURATION_BACKFILL_VERSION) continue;

      const rows = db
        .prepare(
          `SELECT id, payload_json FROM chat_messages
           WHERE role = 'assistant' AND pending = 0 AND payload_json IS NOT NULL`,
        )
        .all() as Array<{ id: string; payload_json: string | null }>;
      if (rows.length === 0) {
        writeVersion(db);
        continue;
      }

      // 先按 traceId 分组，避免逐条查 spans
      const byTrace = new Map<string, string[]>();
      for (const row of rows) {
        stats.scanned += 1;
        let payload: unknown = null;
        if (row.payload_json) {
          try {
            payload = JSON.parse(row.payload_json) as unknown;
          } catch {
            payload = null;
          }
        }
        const traceId = traceIdNeedingBackfill(payload);
        if (!traceId) {
          stats.leftUnknown += 1;
          continue;
        }
        const ids = byTrace.get(traceId);
        if (ids) ids.push(row.id);
        else byTrace.set(traceId, [row.id]);
      }

      if (byTrace.size > 0) {
        const durations = queryDurations(trace, [...byTrace.keys()]);
        const upd = db.prepare("UPDATE chat_messages SET payload_json = ? WHERE id = ?");
        const tx = db.transaction(() => {
          for (const [traceId, ids] of byTrace) {
            const durationMs = durations.get(traceId);
            if (durationMs == null) {
              stats.leftUnknown += ids.length;
              continue;
            }
            for (const id of ids) {
              const row = rows.find((r) => r.id === id);
              const next = mergeDurationIntoPayload(row?.payload_json ?? null, durationMs);
              if (next == null) {
                stats.leftUnknown += 1;
                continue;
              }
              upd.run(next, id);
              stats.updated += 1;
            }
          }
        });
        tx();
      }

      writeVersion(db);
    } catch (err) {
      desktopLog("backfill.duration").warn("workspace failed", {
        meta: { workspaceId, error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  desktopLog("backfill.duration").info("done", { meta: { ...stats } });
  return stats;
}
