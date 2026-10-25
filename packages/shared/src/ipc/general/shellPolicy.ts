/** 命令行审批三模式。 */
export const SHELL_APPROVAL_MODES = ["ai_review", "allowlist", "unrestricted"] as const;
/** 命令行审批模式联合类型。 */
export type ShellApprovalMode = (typeof SHELL_APPROVAL_MODES)[number];
/** 默认：AI 研判。 */
export const DEFAULT_SHELL_APPROVAL_MODE: ShellApprovalMode = "ai_review";

/** 出厂白名单（用户可删；删空后不得回填）。 */
export const DEFAULT_SHELL_ALLOWLIST = [
  "git",
  "pnpm",
  "npm",
  "yarn",
  "npx",
  "node",
  "python",
  "python3",
  "rg",
  "grep",
  "ls",
  "dir",
  "pwd",
  "echo",
  "which",
  "where",
  "type",
  "cat",
  "head",
  "tail",
] as const;

/** 将未知值规范为合法审批模式。 */
export function normalizeShellApprovalMode(
  value: unknown,
  fallback: ShellApprovalMode = DEFAULT_SHELL_APPROVAL_MODE,
): ShellApprovalMode {
  return typeof value === "string" && (SHELL_APPROVAL_MODES as readonly string[]).includes(value)
    ? (value as ShellApprovalMode)
    : fallback;
}

/** 出厂黑名单为空：硬拒绝由用户显式添加，缺字段不回填。 */
export const DEFAULT_SHELL_BLOCKLIST: readonly string[] = [];

/** 去空白、去重、小写化；非字符串跳过。 */
function normalizeShellTokenItems(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const token = item.trim().toLowerCase();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/**
 * 规范化白名单。
 * `raw` 为 `undefined` 时用默认列表；传入数组（含空）则去空白、去重、小写化。
 */
export function normalizeShellAllowlist(raw: unknown): string[] {
  if (raw === undefined) return [...DEFAULT_SHELL_ALLOWLIST];
  if (!Array.isArray(raw)) return [...DEFAULT_SHELL_ALLOWLIST];
  return normalizeShellTokenItems(raw);
}

/**
 * 规范化硬拒绝名单。
 * 缺字段、非数组都得到空列表；数组项再按命令首 token 折叠（剥路径与 Windows 扩展名）。
 */
export function normalizeShellBlocklist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SHELL_BLOCKLIST];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const token = shellCommandBaseToken(item);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** 首 token 是否落在硬拒绝名单上。名单须已规范化。 */
export function isShellTokenBlocked(token: string, blocklist: readonly string[]): boolean {
  const base = shellCommandBaseToken(token);
  if (!base) return false;
  return blocklist.includes(base);
}

/**
 * 黑名单优先：从白名单去掉已被硬拒绝的 token。
 * 比对时同样折叠路径与扩展名，避免 `rm.exe` 留在白名单而 `rm` 在黑名单。
 */
export function shellAllowlistWithoutBlocked(
  allowlist: readonly string[],
  blocklist: readonly string[],
): string[] {
  if (blocklist.length === 0) return [...allowlist];
  return allowlist.filter((token) => !isShellTokenBlocked(token, blocklist));
}

/** 规范化 shell profile id。 */
export function normalizeShellProfileId(value: unknown, fallback = "default"): string {
  if (typeof value !== "string") return fallback;
  const id = value.trim();
  return id || fallback;
}

/**
 * 取命令行首 token（剥路径与 Windows 可执行扩展名），供白名单 / 黑名单匹配。
 * 含 `.com`（如 `format.com`）。与 engine `commandBaseToken` 语义一致。
 */
export function shellCommandBaseToken(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "";
  const first = trimmed.split(/\s+/)[0] ?? "";
  const base = first.replace(/^["']|["']$/g, "");
  const name = base.split(/[/\\]/).pop() ?? base;
  return name.replace(/\.(exe|cmd|bat|com|ps1)$/i, "").toLowerCase();
}

/** 按 && / || / ; 拆开命令链，引号内的分隔符不算。 */
function splitShellChain(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? "";
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      if (current.trim()) parts.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    if (ch === ";" || ch === "\n") {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * 一条命令链里会被当作「命令名」加白的 token（去重、保持出现顺序）。
 * `cd packages/renderer && npx tsc` → `cd`、`npx`。
 */
export function shellWhitelistTokens(command: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const segment of splitShellChain(command)) {
    const token = shellCommandBaseToken(segment);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/**
 * 点「允许并加入白名单」时真正会新写入的命令名。
 * 已在白名单或落在硬拒绝上的不再列入。
 */
export function shellCommandsToAllowlist(
  command: string,
  allowlist: readonly string[],
  blocklist: readonly string[],
): string[] {
  return shellWhitelistTokens(command).filter(
    (token) => !allowlist.includes(token) && !isShellTokenBlocked(token, blocklist),
  );
}
