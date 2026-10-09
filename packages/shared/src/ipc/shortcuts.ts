/**
 * 应用快捷键：目录、默认映射、规范化，以及 accelerator 匹配 / 格式化 / 录制。
 * Accelerator 字符串约定类似 Electron：`Mod+R`（Mod = Windows/Linux 的 Ctrl，macOS 的 Cmd）。
 * 特例：`Escape` 允许无修饰键（停止运行等）。
 */

/** 已注册的快捷键动作 id。 */
export type ShortcutId =
  | "reload"
  | "newChat"
  | "focusComposer"
  | "stopRun"
  | "toggleLeftPanel"
  | "toggleRightPanel"
  | "openConsole"
  | "goChat"
  | "navBack"
  | "navForward";

/** 设置页分组（列表分区标题用）。 */
export type ShortcutGroup = "window" | "chat" | "panels" | "navigation";

/** 设置页分组展示顺序。 */
export const SHORTCUT_GROUPS: ShortcutGroup[] = ["window", "chat", "panels", "navigation"];

/** id → accelerator 字符串映射。 */
export type ShortcutsMap = Record<ShortcutId, string>;

/** 设置页展示用的快捷键元数据。 */
export type ShortcutInfo = {
  id: ShortcutId;
  group: ShortcutGroup;
  title: string;
  description: string;
};

/**
 * 快捷键目录（设置 UI 列表数据源）。
 * title / description 为协议字面量，由调用方按需做 i18n，此处不改文案。
 */
export const SHORTCUT_CATALOG: ShortcutInfo[] = [
  {
    id: "reload",
    group: "window",
    title: "Reload",
    description: "Reload the renderer window (like the browser refresh).",
  },
  {
    id: "openConsole",
    group: "window",
    title: "Open console",
    description: "Open the console (Settings / Logs / Components), or return to chat if already open.",
  },
  {
    id: "goChat",
    group: "window",
    title: "Go to chat",
    description: "Jump to the chat page.",
  },
  {
    id: "newChat",
    group: "chat",
    title: "New chat",
    description: "Start a new chat in the current workspace.",
  },
  {
    id: "focusComposer",
    group: "chat",
    title: "Focus composer",
    description: "Focus the chat input.",
  },
  {
    id: "stopRun",
    group: "chat",
    title: "Stop run",
    description: "Stop the current agent run.",
  },
  {
    id: "toggleLeftPanel",
    group: "panels",
    title: "Toggle workspaces panel",
    description: "Show or hide the left workspaces sidebar.",
  },
  {
    id: "toggleRightPanel",
    group: "panels",
    title: "Toggle right panel",
    description: "Show or hide the right side panel.",
  },
  {
    id: "navBack",
    group: "navigation",
    title: "Back",
    description: "Go back in the in-app page stack.",
  },
  {
    id: "navForward",
    group: "navigation",
    title: "Forward",
    description: "Go forward in the in-app page stack.",
  },
];

/**
 * 按平台返回出厂默认快捷键。
 * - macOS：Cmd 系（`Mod`）+ `[` / `]` 导航，偏好 `Mod+,`
 * - Windows / Linux：Alt+方向键导航；控制台用 `Mod+Shift+J`（避开部分环境对 Ctrl+, 的占用）
 */
export function getDefaultShortcuts(platform: string = processPlatform()): ShortcutsMap {
  const mac = platform === "darwin";
  return {
    reload: "Mod+R",
    openConsole: mac ? "Mod+Comma" : "Mod+Shift+J",
    goChat: mac ? "Mod+1" : "Mod+Shift+1",
    newChat: "Mod+N",
    focusComposer: mac ? "Mod+L" : "Mod+Shift+L",
    stopRun: "Escape",
    toggleLeftPanel: "Mod+B",
    toggleRightPanel: mac ? "Mod+Alt+B" : "Mod+Shift+B",
    navBack: mac ? "Mod+[" : "Alt+ArrowLeft",
    navForward: mac ? "Mod+]" : "Alt+ArrowRight",
  };
}

/**
 * 当前运行平台的默认快捷键快照（模块加载时求值）。
 * 重置 / 规范化请优先用 `getDefaultShortcuts()`，以便按平台取最新默认。
 */
export const DEFAULT_SHORTCUTS: ShortcutsMap = getDefaultShortcuts();

/** 主进程处理的快捷键（before-input-event）；其余由渲染进程处理。 */
export const MAIN_PROCESS_SHORTCUTS: ReadonlySet<ShortcutId> = new Set(["reload"]);

/** 允许无修饰键的加速键 token（大小写不敏感）。 */
const BARE_KEY_ALLOWLIST = new Set(["escape"]);

/** Preload 暴露的快捷键读写 API。 */
export type ThinkerShortcutsApi = {
  getShortcuts(): Promise<ShortcutsMap>;
  setShortcuts(patch: Partial<ShortcutsMap>): Promise<ShortcutsMap>;
  /**
   * 通知主进程「正在录制快捷键」。
   * 录制中主进程应跳过 reload 等 before-input 处理，避免抢走按键。
   */
  setShortcutRecording?(active: boolean): void;
}

/**
 * 从磁盘 / IPC 原始值规范为完整 ShortcutsMap。
 * 只接受目录内 id，且值为非空字符串；其余按平台默认填充。
 */
export function normalizeShortcuts(raw: unknown, platform?: string): ShortcutsMap {
  const base = { ...getDefaultShortcuts(platform) };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<Record<string, unknown>>;
  for (const item of SHORTCUT_CATALOG) {
    const value = obj[item.id];
    if (typeof value === "string" && value.trim()) {
      base[item.id] = value.trim();
    }
  }
  return base;
}

/**
 * 将 accelerator 转为人类可读标签。
 * 例：`Mod+R` → Windows 上 `Ctrl+R`，macOS 上 `⌘R`；`Escape` → `Esc`。
 */
export function formatAcceleratorLabel(
  accel: string,
  platform: string = processPlatform(),
): string {
  const isMac = platform === "darwin";
  return accel
    .split("+")
    .map((part) => {
      const p = part.trim();
      const lower = p.toLowerCase();
      if (lower === "mod") return isMac ? "⌘" : "Ctrl";
      if (lower === "ctrl" || lower === "control") return isMac ? "⌃" : "Ctrl";
      if (lower === "meta" || lower === "cmd" || lower === "command") return isMac ? "⌘" : "Win";
      if (lower === "alt" || lower === "option") return isMac ? "⌥" : "Alt";
      if (lower === "shift") return isMac ? "⇧" : "Shift";
      if (lower === "escape") return "Esc";
      if (lower === "comma") return ",";
      if (lower === "arrowleft") return "←";
      if (lower === "arrowright") return "→";
      if (lower === "arrowup") return "↑";
      if (lower === "arrowdown") return "↓";
      return p.length === 1 ? p.toUpperCase() : p;
    })
    .join(isMac ? "" : "+");
}

/**
 * 探测当前平台字符串（`darwin` / `win32` 等）。
 * Node 优先用 `process.platform`；浏览器用 navigator 启发式。
 */
function processPlatform(): string {
  const g = globalThis as {
    process?: { platform?: string };
    navigator?: { platform?: string; userAgentData?: { platform?: string } };
  };
  if (typeof g.process?.platform === "string") return g.process.platform;
  const nav = g.navigator?.userAgentData?.platform || g.navigator?.platform || "";
  if (/Mac/i.test(nav)) return "darwin";
  return "win32";
}

/**
 * 键盘输入摘要（浏览器 KeyboardEvent 或 Electron 输入事件的子集）。
 * 用于与 accelerator 字符串比对。
 */
export type AcceleratorInput = {
  /** 事件类型；若存在且非 `keyDown` 则不匹配。 */
  type?: string;
  /** 按键字符 / 名（如 `r`、`Enter`）。 */
  key?: string;
  /** 物理键码（如 `KeyR`），作 key 比对失败时的回退。 */
  code?: string;
  control?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
};

/**
 * 判断输入是否命中给定 accelerator。
 * `Mod` 在 macOS 映射为 Meta，在其它平台映射为 Ctrl。
 */
export function matchAccelerator(
  input: AcceleratorInput,
  accel: string,
  platform: string = processPlatform(),
): boolean {
  if (input.type && input.type !== "keyDown") return false;
  const parts = accel
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return false;

  const keyToken = parts[parts.length - 1]!;
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));
  const isMac = platform === "darwin";

  // Mod 按平台展开为 Ctrl 或 Meta；其它修饰键别名归一
  const wantMod = mods.has("mod");
  const wantCtrl = mods.has("ctrl") || mods.has("control") || (wantMod && !isMac);
  const wantMeta = mods.has("meta") || mods.has("cmd") || mods.has("command") || (wantMod && isMac);
  const wantAlt = mods.has("alt") || mods.has("option");
  const wantShift = mods.has("shift");

  if (Boolean(input.control) !== wantCtrl) return false;
  if (Boolean(input.meta) !== wantMeta) return false;
  if (Boolean(input.alt) !== wantAlt) return false;
  if (Boolean(input.shift) !== wantShift) return false;

  const pressed =
    (input.key || "").length === 1 ? (input.key || "").toLowerCase() : input.key || "";
  const expectedRaw = keyToken.length === 1 ? keyToken.toLowerCase() : keyToken;
  const expected = expectedRaw.toLowerCase() === "comma" ? "," : expectedRaw;
  if (pressed.toLowerCase() === expected.toLowerCase()) return true;

  // 回退：单字母键用 KeyR 形式的 code 比对；逗号用 Comma
  const code = input.code || "";
  if (expected === "," && code === "Comma") return true;
  if (expected.length === 1 && code.toLowerCase() === `key${expected}`) return true;
  return false;
}

/**
 * 从浏览器 KeyboardEvent 录制 accelerator。
 * Ctrl/Cmd 统一写成 `Mod`；纯修饰键返回 null。
 * 一般要求至少一个修饰键；`Escape` 等白名单键可单独录制。
 */
export function acceleratorFromKeyboardEvent(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): string | null {
  if (["Control", "Shift", "Alt", "Meta", "Dead"].includes(event.key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const key =
    event.key.length === 1
      ? event.key === ","
        ? "Comma"
        : event.key.toUpperCase()
      : event.key === " "
        ? "Space"
        : event.key;
  parts.push(key);
  if (parts.length === 1 && !BARE_KEY_ALLOWLIST.has(key.toLowerCase())) return null;
  return parts.join("+");
}

/**
 * 将 accelerator 规范为可比较形式。
 * - Ctrl / Meta / Cmd → `Mod`
 * - `,` → `Comma`；单字母大写
 * 用于冲突检测，避免 `Mod+,` 与 `Mod+Comma` 被当成不同键。
 */
export function normalizeAccelerator(accel: string): string {
  const parts = accel
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";

  const keyToken = parts[parts.length - 1]!;
  const mods = parts.slice(0, -1).map((p) => p.toLowerCase());
  const out: string[] = [];

  const wantMod = mods.some(
    (m) =>
      m === "mod" ||
      m === "ctrl" ||
      m === "control" ||
      m === "meta" ||
      m === "cmd" ||
      m === "command",
  );
  if (wantMod) out.push("Mod");
  if (mods.some((m) => m === "alt" || m === "option")) out.push("Alt");
  if (mods.some((m) => m === "shift")) out.push("Shift");

  const lower = keyToken.toLowerCase();
  let key: string;
  if (keyToken === "," || lower === "comma") key = "Comma";
  else if (lower === "escape") key = "Escape";
  else if (lower === "space") key = "Space";
  else if (keyToken.length === 1) key = keyToken.toUpperCase();
  else key = keyToken;

  out.push(key);
  return out.join("+");
}

/**
 * 查找与 `accel` 冲突的其它 ShortcutId（不含 `id` 自身）。
 * 无冲突返回 `null`。
 */
export function findShortcutConflict(
  id: ShortcutId,
  accel: string,
  map: ShortcutsMap,
): ShortcutId | null {
  const norm = normalizeAccelerator(accel);
  if (!norm) return null;
  for (const item of SHORTCUT_CATALOG) {
    if (item.id === id) continue;
    if (normalizeAccelerator(map[item.id] || "") === norm) return item.id;
  }
  return null;
}
