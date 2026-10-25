/**
 * git 子命令级风险判定：只读 / 需确认。
 *
 * 背景：出厂白名单把主命令 `git` 整体加白，而白名单只按命令首 token 匹配，
 * 于是 `git commit` 这类不可逆操作也被静默放行。这里改成按**子命令**分级：
 * 只读命令完全不打扰，不可逆写操作交由调用方强制弹确认卡。
 *
 * 全部为同步字符串解析，无 I/O、无模型调用。
 */
import { shellSplitChain } from "./shellPolicy";

/** 需要用户确认的 git 命令段。 */
export type GitConfirmTarget = {
  /** 命中的原始命令段（原样回显给用户，便于判断）。 */
  segment: string;
  /** 判定依据，如 `git commit`。 */
  reason: string;
  /** 仅影响确认卡文案：remote=影响远端或他人。 */
  severity: "destructive" | "remote";
};

/** 只读子命令：命中即免确认（行为与现在一致）。 */
export const GIT_READ_SUBCOMMANDS: readonly string[] = [
  "status",
  "diff",
  "log",
  "show",
  "grep",
  "blame",
  "describe",
  "cat-file",
  "ls-files",
  "ls-tree",
  "ls-remote",
  "rev-parse",
  "rev-list",
  "whatchanged",
  "shortlog",
  "reflog",
  "merge-base",
  "name-rev",
  "show-ref",
  "for-each-ref",
  "check-ignore",
  "check-attr",
  "help",
  "version",
];

/**
 * 会改动工作区 / 索引但本次不拦截的子命令。
 * 仍走原有白名单 / AI 研判路径（用户选定范围只覆盖不可逆操作）。
 */
export const GIT_MUTABLE_SUBCOMMANDS: readonly string[] = [
  "add",
  "checkout",
  "switch",
  "merge",
  "cherry-pick",
  "pull",
  "fetch",
  "init",
  "clone",
  "apply",
  "stash",
  "worktree",
  "submodule",
  "bisect",
  "bundle",
  "archive",
  "branch",
  "tag",
];

/** 不可逆 / 影响仓库或远端的子命令：必须用户确认。 */
export const GIT_CONFIRM_SUBCOMMANDS: readonly string[] = [
  "commit",
  "push",
  "reset",
  "rebase",
  "clean",
  "restore",
  "revert",
  "rm",
  "mv",
  "update-ref",
  "update-index",
  "filter-branch",
  "gc",
  "prune",
  "am",
  "remote",
];

/** git 全局选项：后面紧跟一个取值，解析子命令时要跳过。 */
const GIT_VALUE_FLAGS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--gitdir",
  "--work-tree",
  "--exec-path",
  "--namespace",
  "--config-env",
]);

/** 子命令的破坏性变体：仅在带上这些参数时才需要确认。 */
const GIT_DESTRUCTIVE_FLAGS: Record<string, readonly string[]> = {
  checkout: ["--", "-f", "--force", "-B"],
  switch: ["--discard-changes", "-f", "--force"],
  branch: ["-d", "-D", "--delete", "-m", "-M"],
  tag: ["-d", "-f", "--delete"],
};

/** 去掉一层首尾引号。 */
function stripQuotes(token: string): string {
  return token.replace(/^["']/, "").replace(/["']$/, "");
}

/** 按空白切 token，引号内的空白不算。 */
function tokenize(command: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (const ch of command) {
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
    if (ch === " " || ch === "\t") {
      if (current) out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

/** 按管道拆片（`git log | head` 只让左侧 git 片参与判定）。 */
function splitPipes(segment: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (const ch of segment) {
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
    if (ch === "|") {
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
 * 取可执行名：剥路径与 Windows 扩展名。
 * 这里不走 `shellCommandBaseToken`，因为它按空白取首段，遇到
 * `"C:\Program Files\Git\bin\git.exe"` 这种带空格的引号路径会切错；
 * 本模块的 tokenize 已把引号内内容保留成一个 token，直接取基名即可。
 */
function executableName(token: string): string {
  const name = stripQuotes(token).split(/[/\\]/).pop() ?? "";
  return name.replace(/\.(exe|cmd|bat|com|ps1)$/i, "").toLowerCase();
}

/** `FOO=bar` 这类 env 前缀。 */
function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

/**
 * 解析单个命令片里的 git 子命令。
 * 非 git 命令返回 null；只有 `git`（打印帮助）时 subcommand 为空串。
 */
export function parseGitSegment(
  segment: string,
): { subcommand: string; args: string[]; flags: string[] } | null {
  const tokens = tokenize(segment);
  let i = 0;
  while (i < tokens.length && isEnvAssignment(stripQuotes(tokens[i] ?? ""))) i += 1;
  if (executableName(tokens[i] ?? "") !== "git") return null;

  i += 1;
  const flags: string[] = [];
  while (i < tokens.length) {
    const tok = stripQuotes(tokens[i] ?? "");
    if (!tok.startsWith("-")) {
      return {
        subcommand: tok.toLowerCase(),
        args: tokens.slice(i + 1).map(stripQuotes),
        flags,
      };
    }
    flags.push(tok);
    const eq = tok.indexOf("=");
    const name = eq > 0 ? tok.slice(0, eq) : tok;
    // 带值选项吞掉紧跟的取值（`-C a`）；`--git-dir=/x` 这类贴附写法不吞
    const takesValue = GIT_VALUE_FLAGS.has(name) && eq < 0;
    i += takesValue ? 2 : 1;
  }
  return { subcommand: "", args: [], flags };
}

/** 找出命中的破坏性参数（用于报错与 reason）。 */
function destructiveFlag(subcommand: string, args: string[], flags: string[]): string | null {
  const candidates = GIT_DESTRUCTIVE_FLAGS[subcommand];
  if (candidates) {
    for (const flag of candidates) {
      if (args.includes(flag) || flags.includes(flag)) return flag;
    }
  }
  if (subcommand === "stash" && (args.includes("drop") || args.includes("clear"))) {
    return args.includes("drop") ? "drop" : "clear";
  }
  if (subcommand === "worktree" && (args.includes("remove") || args.includes("prune"))) {
    return args.includes("remove") ? "remove" : "prune";
  }
  return null;
}

/** 是否影响远端 / 他人。 */
function affectsRemote(subcommand: string, args: string[]): boolean {
  if (subcommand === "push") return true;
  if (subcommand === "remote") {
    return args.some((arg) => ["remove", "rm", "set-url", "rename", "prune"].includes(arg));
  }
  return false;
}

/**
 * 分级：返回 null 表示免确认，否则返回 severity。
 * 未知子命令保守按 destructive（不会静默执行没见过的 git 动作）。
 */
function classifyGit(
  subcommand: string,
  args: string[],
  flags: string[],
): "destructive" | "remote" | null {
  if (!subcommand) return null;

  if (GIT_CONFIRM_SUBCOMMANDS.includes(subcommand)) {
    return affectsRemote(subcommand, args) ? "remote" : "destructive";
  }

  if (destructiveFlag(subcommand, args, flags)) {
    return "destructive";
  }

  // config：只有读取类参数才算只读，写配置需确认
  if (subcommand === "config") {
    const reading = args.some((arg) => ["--get", "--list", "-l", "--get-all"].includes(arg));
    return reading ? null : "destructive";
  }

  if (GIT_READ_SUBCOMMANDS.includes(subcommand)) return null;
  if (GIT_MUTABLE_SUBCOMMANDS.includes(subcommand)) return null;

  return "destructive";
}

/**
 * 取一条命令里**必须用户确认**的 git 段。
 * 只读命令与非 git 命令返回空数组，调用方行为保持原样。
 */
export function gitConfirmTargets(command: string): GitConfirmTarget[] {
  const out: GitConfirmTarget[] = [];
  for (const segment of shellSplitChain(command)) {
    for (const piece of splitPipes(segment)) {
      const parsed = parseGitSegment(piece);
      if (!parsed) continue;
      const severity = classifyGit(parsed.subcommand, parsed.args, parsed.flags);
      if (!severity) continue;
      const flag = destructiveFlag(parsed.subcommand, parsed.args, parsed.flags);
      const reason = `git ${parsed.subcommand}${flag ? ` ${flag}` : ""}`.trim();
      out.push({ segment: piece.trim(), reason, severity });
    }
  }
  return out;
}
