/**
 * read_file 实现：读取工作区内文本文件（整文件或行区间）。
 * 文件不存在时按 basename 扫工作区，把候选路径写进错误文案。
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getReadFileDefaultMaxChars } from "../../config/runtimeLimits";
import {
  formatNumberedSlice,
  parseLineRange,
  resolveRangeInFile,
  splitLines,
} from "../shared/lines";
import {
  formatMissingFileError,
  isEnoentError,
  suggestPathsByBasename,
} from "../shared/pathSuggest";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted } from "../shared/walk";
import type { ToolArgs, ToolContext } from "../types";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return fallback;
}

/** ENOENT 时扫同名文件，拼进错误。 */
async function throwMissingFile(
  workspaceRoot: string,
  pathLabel: string,
  absoluteTarget: string,
  signal: AbortSignal,
): Promise<never> {
  const suggestions = await suggestPathsByBasename({
    workspaceRoot,
    requestedRel: pathLabel,
    basename: path.basename(absoluteTarget),
    signal,
  });
  throw new Error(formatMissingFileError(pathLabel, suggestions));
}

export async function readFileTool(args: ToolArgs, ctx: ToolContext): Promise<string> {
  throwIfAborted(ctx.signal, "Read file");
  const rel = asString(args.path)?.trim();
  if (!rel) {
    throw new Error("read_file requires parameters.path (workspace-relative).");
  }

  const target = resolveWorkspacePath(ctx.workspaceRoot, rel, { access: "read" });
  const pathLabel = toWorkspaceRelative(ctx.workspaceRoot, target);

  let st;
  try {
    st = await stat(target);
  } catch (err) {
    if (isEnoentError(err)) {
      await throwMissingFile(ctx.workspaceRoot, pathLabel, target, ctx.signal);
    }
    throw err;
  }
  if (!st.isFile()) {
    throw new Error(`Not a file: ${pathLabel}`);
  }

  throwIfAborted(ctx.signal, "Read file");
  let text: string;
  try {
    text = await readFile(target, "utf8");
  } catch (err) {
    if (isEnoentError(err)) {
      await throwMissingFile(ctx.workspaceRoot, pathLabel, target, ctx.signal);
    }
    throw err;
  }
  const lines = splitLines(text);
  const totalLines = lines.length;
  const parsed = parseLineRange(args);

  if (parsed) {
    const range = resolveRangeInFile(parsed, totalLines, pathLabel);
    const body = formatNumberedSlice(lines, range);
    const header = [
      `path\t${pathLabel}`,
      `lines\t${range.start}-${range.end}`,
      `total_lines\t${totalLines}`,
      `chars\t${text.length}`,
    ].join("\n");
    return `${header}\n\n${body}`;
  }

  const maxChars = asPositiveInt(args.max_chars, getReadFileDefaultMaxChars());
  const shown = text.length > maxChars ? text.slice(0, maxChars) : text;
  const truncated = text.length > maxChars;

  const header = [
    `path\t${pathLabel}`,
    `total_lines\t${totalLines}`,
    `chars\t${text.length}`,
    truncated ? `truncated\ttrue\tmax_chars\t${maxChars}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${header}\n\n${shown}`;
}
