/**
 * write_file 实现：创建 / 整文件覆盖，或按行区间替换。
 */
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { captureBeforeImage } from "../../checkpoint/fileSnapshot";
import { buildUnifiedDiff } from "../shared/diff";
import {
  detectEol,
  joinLines,
  type LineRange,
  parseLineRange,
  replaceLineRange,
  resolveRangeInFile,
  splitLines,
} from "../shared/lines";
import { withPathLock } from "../shared/pathLock";
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
  // 写同一路径串行化：并行 run 之间不会互相覆盖（详见 tools/shared/pathLock）
  return withPathLock(ctx.workspaceRoot, rel, () => writeFileInner(args, ctx));
}

/** 真正的写入实现（拿到路径锁之后才执行）。 */
async function writeFileInner(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
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
  const parsed = parseLineRange(args);
  const existed = fs.existsSync(target);

  let before = "";
  if (existed) {
    before = await readFile(target, "utf8");
  }
  // 首写前留下 before-image（幂等；失败不影响写入本身）
  await captureBeforeImage(ctx.workspaceRoot, pathLabel);

  let after: string;
  let range: LineRange | null = null;
  if (parsed) {
    if (!existed) {
      throw new Error(
        `write_file line range requires an existing file: ${pathLabel}. Omit start_line/end_line to create it.`,
      );
    }
    const eol = detectEol(before);
    const lines = splitLines(before);
    range = resolveRangeInFile(parsed, lines.length, pathLabel);
    after = joinLines(replaceLineRange(lines, range, contents), eol);
  } else if (existed && detectEol(before) === "\r\n") {
    // 整文件覆盖时保留原行尾：模型给出的内容多为 LF，直接用会把 CRLF 文件整份改写，
    // 让 diff / 提交里混进无关的行尾变更（EOL churn）
    after = joinLines(splitLines(contents), "\r\n");
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
