/**
 * write_file 实现：创建 / 整文件覆盖，或按行区间替换。
 */
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildUnifiedDiff } from "../shared/diff";
import {
  assertRangeInFile,
  detectEol,
  joinLines,
  parseLineRange,
  replaceLineRange,
  splitLines,
} from "../shared/lines";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted } from "../shared/walk";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function writeFileTool(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  throwIfAborted(ctx.signal, "Write file");
  const rel = asString(args.path)?.trim();
  if (!rel) {
    throw new Error("write_file requires parameters.path (workspace-relative).");
  }
  const contents = asString(args.contents);
  if (contents == null) {
    throw new Error("write_file requires parameters.contents (may be empty).");
  }

  const target = resolveWorkspacePath(ctx.workspaceRoot, rel, { access: "write" });
  const pathLabel = toWorkspaceRelative(ctx.workspaceRoot, target);
  const range = parseLineRange(args);
  const existed = fs.existsSync(target);

  let before = "";
  if (existed) {
    before = await readFile(target, "utf8");
  }

  let after: string;
  if (range) {
    if (!existed) {
      throw new Error(
        `write_file line range requires an existing file: ${pathLabel}. Omit start_line/end_line to create it.`,
      );
    }
    const eol = detectEol(before);
    const lines = splitLines(before);
    assertRangeInFile(range, lines.length, pathLabel);
    after = joinLines(replaceLineRange(lines, range, contents), eol);
  } else {
    after = contents;
  }

  await mkdir(path.dirname(target), { recursive: true });
  throwIfAborted(ctx.signal, "Write file");
  await writeFile(target, after, "utf8");

  const meta = [
    `path\t${pathLabel}`,
    `chars\t${after.length}`,
    `written\ttrue`,
    range ? `lines\t${range.start}-${range.end}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    output: meta,
    ui: {
      path: pathLabel,
      diff: buildUnifiedDiff(pathLabel, before, after),
    },
  };
}
