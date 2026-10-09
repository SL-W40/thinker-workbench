/**
 * read_file 实现：读取工作区内文本文件（整文件或行区间）。
 */
import { readFile, stat } from "node:fs/promises";
import {
  assertRangeInFile,
  formatNumberedSlice,
  parseLineRange,
  splitLines,
} from "../shared/lines";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted } from "../shared/walk";
import type { ToolArgs, ToolContext } from "../types";

const DEFAULT_MAX_CHARS = 120_000;

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

export async function readFileTool(args: ToolArgs, ctx: ToolContext): Promise<string> {
  throwIfAborted(ctx.signal, "Read file");
  const rel = asString(args.path)?.trim();
  if (!rel) {
    throw new Error("read_file requires parameters.path (workspace-relative).");
  }

  const target = resolveWorkspacePath(ctx.workspaceRoot, rel, { access: "read" });
  const pathLabel = toWorkspaceRelative(ctx.workspaceRoot, target);
  const st = await stat(target);
  if (!st.isFile()) {
    throw new Error(`Not a file: ${pathLabel}`);
  }

  throwIfAborted(ctx.signal, "Read file");
  const text = await readFile(target, "utf8");
  const lines = splitLines(text);
  const totalLines = lines.length;
  const range = parseLineRange(args);

  if (range) {
    assertRangeInFile(range, totalLines, pathLabel);
    const body = formatNumberedSlice(lines, range);
    const header = [
      `path\t${pathLabel}`,
      `lines\t${range.start}-${range.end}`,
      `total_lines\t${totalLines}`,
      `chars\t${text.length}`,
    ].join("\n");
    return `${header}\n\n${body}`;
  }

  const maxChars = asPositiveInt(args.max_chars, DEFAULT_MAX_CHARS);
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
