/**
 * 可再生缓存的保留策略：按天数过期 + 总大小上限。
 *
 * 清理目标由布局表里 `purge: "retention"` 的条目给出，新增缓存目录无需改这里。
 * 启动时、退出前、每天定时各跑一次；删除按 mtime 从旧到新，且始终保留最近若干文件。
 */
import fs from "node:fs";
import path from "node:path";
import { type DataLayoutKey, dataPath, listDataEntries } from "@thinker-workbench/shared";
import { getDataDir } from "../config/paths";

/** 每个缓存目录至少保留的文件数（避免把刚生成的截图清光）。 */
const MIN_KEEP_FILES = 20;

type CacheFile = { file: string; mtimeMs: number; bytes: number };

function listFiles(dir: string): CacheFile[] {
  const out: CacheFile[] = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (current: string): void => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const st = fs.statSync(full);
        out.push({ file: full, mtimeMs: st.mtimeMs, bytes: st.size });
      } catch {
        /* ignore */
      }
    }
  };
  walk(dir);
  return out;
}

function pruneDir(
  dir: string,
  maxAgeDays: number,
  maxBytes: number,
): { removed: number; bytes: number } {
  const all = listFiles(dir);
  let removed = 0;
  let freed = 0;

  if (maxAgeDays > 0) {
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    for (const item of all) {
      if (item.mtimeMs >= cutoff) continue;
      try {
        fs.unlinkSync(item.file);
        removed += 1;
        freed += item.bytes;
      } catch {
        /* ignore */
      }
    }
  }

  if (maxBytes > 0) {
    const rest = listFiles(dir).sort((a, b) => a.mtimeMs - b.mtimeMs);
    let total = rest.reduce((sum, item) => sum + item.bytes, 0);
    let kept = rest.length;
    for (const item of rest) {
      if (total <= maxBytes) break;
      // 保留最近 MIN_KEEP_FILES 个：宁可超限也不把正在用的截图删空
      if (kept <= MIN_KEEP_FILES) break;
      try {
        fs.unlinkSync(item.file);
        removed += 1;
        freed += item.bytes;
        total -= item.bytes;
        kept -= 1;
      } catch {
        /* ignore */
      }
    }
  }

  return { removed, bytes: freed };
}

/** 清理全部缓存目录；返回删除文件数与释放字节。 */
export function runCacheRetention(): { removed: number; freedBytes: number } {
  const dataDir = getDataDir();
  let removed = 0;
  let freedBytes = 0;
  for (const entry of listDataEntries()) {
    if (entry.purge !== "retention" || !entry.retention) continue;
    try {
      const res = pruneDir(
        dataPath(dataDir, entry.key as DataLayoutKey),
        entry.retention.maxAgeDays,
        entry.retention.maxBytes,
      );
      removed += res.removed;
      freedBytes += res.bytes;
    } catch {
      /* 单个目录失败不阻断其余 */
    }
  }
  return { removed, freedBytes };
}
