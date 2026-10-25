/**
 * edit_file 实现：在已有文件中做精确字符串替换。
 */
import { readFile, writeFile } from "node:fs/promises";
import { captureBeforeImage } from "../../checkpoint/fileSnapshot";
import { buildUnifiedDiff } from "../shared/diff";
import { detectEol, joinLines, splitLines } from "../shared/lines";
import { withPathLock } from "../shared/pathLock";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted } from "../shared/walk";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

/** 统一成 LF。 */
function toLf(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** old_string 每次出现处的行号（1-based），最多 limit 个。 */
function matchLineNumbers(haystack: string, needle: string, limit = 5): number[] {
  const out: number[] = [];
  let from = 0;
  while (out.length < limit) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    out.push(haystack.slice(0, index).split("\n").length);
    from = index + needle.length;
  }
  return out;
}

/**
 * 匹配失败时给出最接近的行号，帮模型一轮内自纠。
 * 先找包含 old_string 首行的行；再退化为「最长公共前缀」最接近的那一行。
 */
function closestLineHint(lines: string[], oldString: string): string {
  const wanted =
    splitLines(oldString)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? oldString.trim();
  if (!wanted) return "";

  const hits: number[] = [];
  for (let i = 0; i < lines.length && hits.length < 3; i += 1) {
    if ((lines[i] ?? "").trim().includes(wanted)) hits.push(i + 1);
  }
  if (hits.length > 0) return `closest match at line(s) ${hits.join(", ")}`;

  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").trim();
    let score = 0;
    const max = Math.min(line.length, wanted.length);
    while (score < max && line[score] === wanted[score]) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return bestScore > 0 ? `closest line ${best + 1} shares a ${bestScore}-char prefix` : "";
}

/** 参数入口：先拿路径锁再编辑，避免并行 run 写同一文件互相覆盖。 */
export async function editFileTool(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  throwIfAborted(ctx.signal, "Edit file");
  const rel = asString(args.path)?.trim();
  if (!rel) {
    throw new Error("edit_file requires parameters.path (workspace-relative).");
  }
  return withPathLock(ctx.workspaceRoot, rel, () => editFileInner(args, ctx));
}

/** 真正的编辑实现（拿到路径锁之后才执行）。 */
async function editFileInner(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  throwIfAborted(ctx.signal, "Edit file");
  const rel = asString(args.path)?.trim();
  if (!rel) {
    throw new Error("edit_file requires parameters.path (workspace-relative).");
  }
  const oldString = asString(args.old_string);
  if (oldString == null || oldString === "") {
    throw new Error("edit_file requires non-empty parameters.old_string.");
  }
  const newString = asString(args.new_string);
  if (newString == null) {
    throw new Error("edit_file requires parameters.new_string (may be empty to delete).");
  }
  if (oldString === newString) {
    throw new Error("edit_file: old_string and new_string are identical.");
  }

  const replaceAll = asBool(args.replace_all, false);
  const target = resolveWorkspacePath(ctx.workspaceRoot, rel, { access: "write" });
  const before = await readFile(target, "utf8");
  // 首改前留下 before-image（幂等；失败不影响编辑本身）
  await captureBeforeImage(ctx.workspaceRoot, toWorkspaceRelative(ctx.workspaceRoot, target));
  throwIfAborted(ctx.signal, "Edit file");

  // read_file 会把 CRLF 归一成 LF 再展示，模型给出的 old_string 通常只有 LF；
  // 而 git 检出的文件在 Windows 上多为 CRLF，原字节匹配必然 0 命中。
  // 这里在 0 命中前先把双方归一成 LF 再匹配，写回时按文件原本的行尾还原。
  const eol = detectEol(before);
  const normalized = eol === "\r\n" && !oldString.includes("\r");
  const haystack = normalized ? toLf(before) : before;
  const replacement = normalized ? toLf(newString) : newString;

  const count = haystack.split(oldString).length - 1;
  if (count === 0) {
    const pathLabel = toWorkspaceRelative(ctx.workspaceRoot, target);
    const hint = closestLineHint(splitLines(before), oldString);
    throw new Error(
      [
        `edit_file: old_string not found in ${pathLabel}.`,
        `The file uses ${eol === "\r\n" ? "CRLF" : "LF"} line endings${
          normalized ? " (matched after normalizing both sides to LF)" : ""
        }.`,
        hint,
        "Re-read the file with read_file and copy the text exactly (indentation, punctuation, line endings).",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  if (count > 1 && !replaceAll) {
    const lines = matchLineNumbers(haystack, oldString);
    throw new Error(
      [
        `edit_file: old_string matched ${count} times`,
        lines.length > 0 ? `(lines: ${lines.join(", ")})` : "",
        "; set replace_all=true or provide a more unique old_string.",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const edited = replaceAll
    ? haystack.split(oldString).join(replacement)
    : haystack.replace(oldString, replacement);
  const after = normalized ? joinLines(splitLines(edited), "\r\n") : edited;

  await writeFile(target, after, "utf8");
  throwIfAborted(ctx.signal, "Edit file");

  const pathLabel = toWorkspaceRelative(ctx.workspaceRoot, target);
  const replacements = replaceAll ? count : 1;
  return {
    output: [
      `path\t${pathLabel}`,
      `replacements\t${replacements}`,
      `chars_before\t${before.length}`,
      `chars_after\t${after.length}`,
    ].join("\n"),
    ui: {
      path: pathLabel,
      diff: buildUnifiedDiff(pathLabel, before, after),
    },
  };
}
