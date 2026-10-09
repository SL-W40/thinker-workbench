/**
 * UI / 窗口 session 持久化（`<dataDir>/session.json`）。
 *
 * 保存路由 hash、设置分区、页面栈与窗口几何；带内存缓存与防抖写入。
 */
import fs from "node:fs";
import path from "node:path";
import type { PageStackSnapshot, UiSessionSnapshot } from "@thinker-workbench/shared";
import { computeDefaultWindowSize } from "../window/defaultBounds";
import { getDataDir } from "./paths";

/** 持久化的窗口几何（含可选坐标与最大化标志）。 */
export type SessionWindow = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
};

/** 完整 session 状态（磁盘与内存共用形状）。 */
export type SessionState = {
  /** 应用 location hash，例如 `#/settings/model`。 */
  hash: string;
  settingsSection: string;
  stack: PageStackSnapshot;
  window: SessionWindow;
};

/** 合法页面 id（`settings` 仍接受以便迁移旧 session，渲染层映射到控制台）。 */
const PAGE_IDS = new Set(["chat", "settings", "components", "tools"]);
/** 合法设置分区 id。 */
const SECTION_IDS = new Set(["general", "model", "shortcuts"]);

/** Electron `screen` 不可用时（测试 / 极早启动）的窗口回退尺寸。 */
const FALLBACK_WINDOW: SessionWindow = {
  width: 1080,
  height: 720,
  maximized: false,
};

/** 默认页面栈：仅 chat。 */
const DEFAULT_STACK: PageStackSnapshot = {
  entries: ["chat"],
  index: 0,
  visited: ["chat"],
};

/** 内存中的 session 缓存。 */
let cached: SessionState | null = null;
/** 防抖写盘定时器。 */
let writeTimer: ReturnType<typeof setTimeout> | null = null;

/** session.json 绝对路径（落在可配置的 dataDir 下）。 */
export function sessionPath(): string {
  return path.join(getDataDir(), "session.json");
}

/** 将任意输入规范为以 `#/` 开头的 hash。 */
function normalizeHash(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "#/chat";
  const value = raw.trim();
  if (value.startsWith("#/")) return value;
  if (value.startsWith("#")) return `#/${value.slice(1)}`;
  if (value.startsWith("/")) return `#${value}`;
  return `#/${value}`;
}

/** 按当前显示器计算默认窗口尺寸，失败则用 FALLBACK_WINDOW。 */
function adaptiveWindowFallback(): SessionWindow {
  try {
    return { ...computeDefaultWindowSize(), maximized: false };
  } catch {
    return { ...FALLBACK_WINDOW };
  }
}

/**
 * 规范化窗口几何；非法宽高回退到 fallback。
 * @param fallback 默认取自适应尺寸
 */
function normalizeWindow(
  raw: unknown,
  fallback: SessionWindow = adaptiveWindowFallback(),
): SessionWindow {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const obj = raw as Partial<SessionWindow>;
  const width =
    typeof obj.width === "number" && obj.width >= 320 ? Math.round(obj.width) : fallback.width;
  const height =
    typeof obj.height === "number" && obj.height >= 280 ? Math.round(obj.height) : fallback.height;
  return {
    width,
    height,
    maximized: Boolean(obj.maximized),
    x: typeof obj.x === "number" ? Math.round(obj.x) : undefined,
    y: typeof obj.y === "number" ? Math.round(obj.y) : undefined,
  };
}

/** 仅接受已知页面 id。 */
function normalizePageId(raw: unknown): string | null {
  return typeof raw === "string" && PAGE_IDS.has(raw) ? raw : null;
}

/** 规范化页面栈；损坏数据回退到默认栈。 */
export function normalizeStack(raw: unknown): PageStackSnapshot {
  if (!raw || typeof raw !== "object")
    return {
      ...DEFAULT_STACK,
      entries: [...DEFAULT_STACK.entries],
      visited: [...DEFAULT_STACK.visited],
    };
  const obj = raw as Partial<PageStackSnapshot>;
  const entries = Array.isArray(obj.entries)
    ? obj.entries.map(normalizePageId).filter((id): id is string => Boolean(id))
    : [];
  const safeEntries = entries.length ? entries : ["chat"];
  const index =
    typeof obj.index === "number" && obj.index >= 0 && obj.index < safeEntries.length
      ? Math.round(obj.index)
      : safeEntries.length - 1;
  const visitedRaw = Array.isArray(obj.visited)
    ? obj.visited.map(normalizePageId).filter((id): id is string => Boolean(id))
    : [];
  const visited = [...new Set([...visitedRaw, ...safeEntries])];
  return { entries: safeEntries, index, visited };
}

/** 规范化设置分区；非法则回退 general。 */
function normalizeSection(raw: unknown): string {
  return typeof raw === "string" && SECTION_IDS.has(raw) ? raw : "general";
}

/** 由当前页与设置分区推导 location hash。 */
function hashFor(page: string, section: string): string {
  if (page === "settings" || page === "tools") return `#/tools/settings/${section}`;
  return page === "chat" ? "#/chat" : `#/${page}`;
}

/**
 * 加载 session（带缓存）。
 * 磁盘损坏或缺失时写入合理默认值；hash 始终与当前栈页对齐。
 */
export function loadSession(): SessionState {
  if (cached) return cached;
  const file = sessionPath();
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<SessionState>;
      const stack = normalizeStack(parsed.stack);
      const settingsSection = normalizeSection(parsed.settingsSection);
      const current = stack.entries[stack.index] ?? "chat";
      cached = {
        hash: parsed.hash ? normalizeHash(parsed.hash) : hashFor(current, settingsSection),
        settingsSection,
        stack,
        window: normalizeWindow(parsed.window),
      };
      // 保持 hash 与栈当前页一致
      cached.hash = hashFor(current, settingsSection);
      return cached;
    }
  } catch (err) {
    console.error("[session] failed to load", err);
  }
  cached = {
    hash: "#/chat",
    settingsSection: "general",
    stack: {
      entries: [...DEFAULT_STACK.entries],
      index: 0,
      visited: [...DEFAULT_STACK.visited],
    },
    window: adaptiveWindowFallback(),
  };
  return cached;
}

/** 立即将缓存写入磁盘。 */
function flushSession(): void {
  if (!cached) return;
  const file = sessionPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(cached, null, 2)}\n`, "utf8");
}

/** 防抖调度写盘（约 200ms）。 */
function scheduleSave(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      flushSession();
    } catch (err) {
      console.error("[session] failed to save", err);
    }
  }, 200);
}

/** 取消防抖并立即落盘（退出前等场景）。 */
export function saveSessionNow(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  try {
    flushSession();
  } catch (err) {
    console.error("[session] failed to save", err);
  }
}

/**
 * 清空 session 内存缓存（dataDir 切换后调用，下次 load 走新路径）。
 * @param reload 为 true 时立刻从新路径加载。
 */
export function resetSessionCache(reload = true): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  cached = null;
  if (reload) loadSession();
}

/** 更新并持久化路由 hash。 */
export function updateSessionHash(hash: string): void {
  const next = normalizeHash(hash);
  const current = loadSession();
  if (current.hash === next) return;
  cached = { ...current, hash: next };
  scheduleSave();
}

/** 更新并持久化窗口几何。 */
export function updateSessionWindow(window: SessionWindow): void {
  const current = loadSession();
  cached = { ...current, window: normalizeWindow(window) };
  scheduleSave();
}

/** 供渲染进程同步读取的 UI session 快照（不含窗口几何）。 */
export function getUiSessionSnapshot(): UiSessionSnapshot {
  const session = loadSession();
  return {
    hash: session.hash,
    settingsSection: session.settingsSection,
    stack: {
      entries: [...session.stack.entries],
      index: session.stack.index,
      visited: [...session.stack.visited],
    },
  };
}

/**
 * 由渲染进程写入 UI session 快照。
 * hash 优先由栈当前页推导，保证前进/后退一致；窗口几何保留原值。
 */
export function setUiSessionSnapshot(snapshot: UiSessionSnapshot): void {
  const stack = normalizeStack(snapshot.stack);
  const settingsSection = normalizeSection(snapshot.settingsSection);
  const current = stack.entries[stack.index] ?? "chat";
  const hash = snapshot.hash ? normalizeHash(snapshot.hash) : hashFor(current, settingsSection);
  const prev = loadSession();
  cached = {
    hash: hashFor(current, settingsSection) || hash,
    settingsSection,
    stack,
    window: prev.window,
  };
  // 优先使用栈推导的 hash，保证前进/后退一致
  cached.hash = hashFor(current, settingsSection);
  scheduleSave();
}

/** 供 `loadURL` / `loadFile` 使用的 hash 片段（含前导 `#`）。 */
export function getSessionHash(): string {
  return loadSession().hash;
}

/** 读取已持久化的窗口几何。 */
export function getSessionWindow(): SessionWindow {
  return loadSession().window;
}
