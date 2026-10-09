/**
 * 应用根目录变更预览与历史数据迁移。
 *
 * 迁移范围：当前 dataDir 下全部顶层内容（catalog / workspaces / logs / session /
 * skills / mcps 及未来新增），以及引导路径上的 `settings.json`（若尚未在根内）。
 */
import fs from "node:fs";
import path from "node:path";
import type {
  DataDirChangePreview,
  DataDirChangeRequest,
  DataDirChangeResult,
  DataDirMigrateItem,
  DataDirMigrateProgress,
  GeneralSettings,
} from "@thinker-workbench/shared";
import { countRunningSessions } from "../db/workspacesStore";
import { closeThinkerDb } from "../db/thinkerDb";
import { closeLogsDb } from "../log/logsDb";
import { getDataDir } from "./paths";
import { resetSessionCache, saveSessionNow } from "./sessionStore";
import {
  commitDataDirSetting,
  getGeneralSettings,
  settingsPath,
} from "./settingsStore";
import { resolveDataDir } from "./thinkerHome";

/** 已知顶层目录/文件的展示名（其余顶层项也会一并迁移）。 */
const KNOWN_LABELS: Record<string, string> = {
  "catalog.db": "catalog.db",
  "catalog.db-wal": "catalog.db-wal",
  "catalog.db-shm": "catalog.db-shm",
  workspaces: "workspaces",
  logs: "logs",
  "session.json": "session.json",
  skills: "skills",
  rules: "rules",
  mcps: "mcps",
};

type ProgressFn = (progress: DataDirMigrateProgress) => void;

function dirBytes(root: string): number {
  if (!fs.existsSync(root)) return 0;
  const st = fs.statSync(root);
  if (st.isFile()) return st.size;
  let total = 0;
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let child: fs.Stats;
      try {
        child = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (child.isSymbolicLink()) continue;
      if (child.isDirectory()) walk(full);
      else total += child.size;
    }
  };
  walk(root);
  return total;
}

function collectFiles(root: string): Array<{ abs: string; rel: string; size: number }> {
  const out: Array<{ abs: string; rel: string; size: number }> = [];
  if (!fs.existsSync(root)) return out;
  const st = fs.statSync(root);
  if (st.isFile()) {
    out.push({ abs: root, rel: path.basename(root), size: st.size });
    return out;
  }
  const walk = (dir: string, relBase: string) => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const rel = relBase ? path.join(relBase, name) : name;
      let child: fs.Stats;
      try {
        child = fs.lstatSync(abs);
      } catch {
        continue;
      }
      if (child.isSymbolicLink()) continue;
      if (child.isDirectory()) walk(abs, rel);
      else out.push({ abs, rel, size: child.size });
    }
  };
  walk(root, path.basename(root));
  return out;
}

function samePath(a: string, b: string): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === "win32"
    ? na.toLowerCase() === nb.toLowerCase()
    : na === nb;
}

function isNested(parent: string, child: string): boolean {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  const rel = path.relative(p, c);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** 组装可迁移项列表（含 settings.json 与 dataDir 顶层）。 */
export function listMigratableItems(fromDataDir: string): DataDirMigrateItem[] {
  const items: DataDirMigrateItem[] = [];

  const settings = settingsPath();
  const settingsAlreadyUnderFrom =
    fs.existsSync(settings) &&
    (samePath(path.dirname(settings), fromDataDir) ||
      isNested(fromDataDir, settings));

  // 引导 settings 不在当前 dataDir 内时单独列入；已在根下则由顶层扫描覆盖
  if (!settingsAlreadyUnderFrom) {
    items.push({
      id: "settings",
      label: "settings.json",
      sourcePath: settings,
      destRelative: "settings.json",
      exists: fs.existsSync(settings),
      bytes: fs.existsSync(settings) ? fs.statSync(settings).size : 0,
    });
  }

  if (!fs.existsSync(fromDataDir)) return items;

  const names = fs.readdirSync(fromDataDir).sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    // 跳过临时/锁文件以外的 sqlite 附属已在 KNOWN；全部顶层都迁
    const sourcePath = path.join(fromDataDir, name);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(sourcePath);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    items.push({
      id: name === "settings.json" ? "settings" : `data:${name}`,
      label: KNOWN_LABELS[name] ?? name,
      sourcePath,
      destRelative: name,
      exists: true,
      bytes: st.isDirectory() ? dirBytes(sourcePath) : st.size,
    });
  }

  return items;
}

/** 预览 dataDir 变更（不落盘、不迁移）。 */
export function previewDataDirChange(configured: string): DataDirChangePreview {
  const from = getDataDir();
  const configuredTo = configured.trim();
  const to = resolveDataDir(configuredTo);
  const items = listMigratableItems(from);
  const existing = items.filter((i) => i.exists);
  return {
    from,
    to,
    configuredTo,
    changed: !samePath(from, to),
    runningSessionCount: countRunningSessions(),
    items: existing,
    totalBytes: existing.reduce((n, i) => n + i.bytes, 0),
  };
}

function emit(
  onProgress: ProgressFn | undefined,
  progress: DataDirMigrateProgress,
): void {
  onProgress?.(progress);
}

/**
 * 应用数据目录变更。
 * @param reopen 切换后重开 DB / session / 日志的回调（由 main 注入）
 */
export function applyDataDirChange(
  request: DataDirChangeRequest,
  options: {
    onProgress?: ProgressFn;
    reopen: () => void;
  },
): DataDirChangeResult {
  const preview = previewDataDirChange(request.dataDir ?? "");
  if (!preview.changed) {
    return { ok: true, general: getGeneralSettings(), preview };
  }
  if (preview.runningSessionCount > 0) {
    return {
      ok: false,
      error: `running_sessions:${preview.runningSessionCount}`,
      preview,
    };
  }
  if (isNested(preview.from, preview.to) || isNested(preview.to, preview.from)) {
    return {
      ok: false,
      error: "nested_paths",
      preview,
    };
  }

  try {
    emit(options.onProgress, {
      phase: "preparing",
      done: 0,
      total: 0,
      percent: 0,
      message: "preparing",
    });

    // 关闭占用 dataDir 的句柄，便于拷贝
    try {
      saveSessionNow();
    } catch {
      /* ignore */
    }
    closeLogsDb();
    closeThinkerDb();

    if (request.migrate) {
      fs.mkdirSync(preview.to, { recursive: true });

      type FileJob = { abs: string; dest: string; label: string };
      const jobs: FileJob[] = [];
      for (const item of preview.items) {
        if (!item.exists) continue;
        if (item.id === "settings") {
          jobs.push({
            abs: item.sourcePath,
            dest: path.join(preview.to, item.destRelative),
            label: item.label,
          });
          continue;
        }
        for (const f of collectFiles(item.sourcePath)) {
          // collectFiles 对目录会把 basename 放进 rel 前缀
          const rel = fs.statSync(item.sourcePath).isDirectory()
            ? f.rel
            : item.destRelative;
          jobs.push({
            abs: f.abs,
            dest: path.join(preview.to, rel),
            label: item.label,
          });
        }
      }

      const total = jobs.length;
      let done = 0;
      emit(options.onProgress, {
        phase: "copying",
        done: 0,
        total,
        percent: 0,
        current: preview.items[0]?.label,
      });

      for (const job of jobs) {
        if (samePath(job.abs, job.dest)) {
          done += 1;
          emit(options.onProgress, {
            phase: "copying",
            done,
            total,
            percent: total === 0 ? 100 : Math.round((done / total) * 100),
            current: job.label,
          });
          continue;
        }
        fs.mkdirSync(path.dirname(job.dest), { recursive: true });
        fs.copyFileSync(job.abs, job.dest);
        done += 1;
        emit(options.onProgress, {
          phase: "copying",
          done,
          total,
          percent: total === 0 ? 100 : Math.round((done / total) * 100),
          current: job.label,
        });
      }
    } else {
      fs.mkdirSync(preview.to, { recursive: true });
    }

    emit(options.onProgress, {
      phase: "switching",
      done: 1,
      total: 1,
      percent: 100,
      message: "switching",
    });

    const general: GeneralSettings = commitDataDirSetting(preview.configuredTo);
    options.reopen();

    emit(options.onProgress, {
      phase: "done",
      done: 1,
      total: 1,
      percent: 100,
      message: "done",
    });

    return { ok: true, general, preview };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 尽量恢复旧库
    try {
      options.reopen();
    } catch {
      /* ignore */
    }
    emit(options.onProgress, {
      phase: "error",
      done: 0,
      total: 0,
      percent: 0,
      message,
    });
    return { ok: false, error: message, preview };
  }
}

/** 切换 dataDir 后重载 session 缓存（路径已变）。 */
export function reloadSessionAfterDataDirChange(): void {
  resetSessionCache(true);
}
