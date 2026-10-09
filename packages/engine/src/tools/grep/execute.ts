/**
 * grep 实现：遍历文本类文件，按行匹配正则，输出 `相对路径:行号:内容`。
 * 限制单文件大小与总命中数，跳过含 NUL 的二进制内容。
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted, walkFiles } from "../shared/walk";
import type { ToolArgs, ToolContext } from "../types";

/** 单文件最大读取字节数。 */
const MAX_FILE_BYTES = 1_000_000;
/** 单次调用最多返回的命中行数。 */
const MAX_MATCHES = 100;

/** 视为文本、值得打开的扩展名；另特判 Dockerfile。 */
const TEXTISH =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|less|css|html|yml|yaml|toml|xml|svg|sh|ps1|py|rs|go|java|kt|swift|c|cc|cpp|h|hpp|cs|sql|graphql|env|ignore|editorconfig)$/i;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function grepTool(args: ToolArgs, ctx: ToolContext): Promise<string> {
  const pattern = asString(args.pattern)?.trim() ?? "";
  if (!pattern) {
    throw new Error("Grep requires parameters.pattern (regex).");
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "gm");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid regex: ${message}`);
  }

  const root = resolveWorkspacePath(ctx.workspaceRoot, asString(args.path), { access: "read" });
  const hits: string[] = [];

  for await (const file of walkFiles(root, ctx.signal)) {
    throwIfAborted(ctx.signal, "Grep");
    if (!TEXTISH.test(file) && path.basename(file) !== "Dockerfile") continue;

    let size: number;
    try {
      size = (await stat(file)).size;
    } catch {
      continue;
    }
    if (size <= 0 || size > MAX_FILE_BYTES) continue;

    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    // 含空字符的当作二进制跳过
    if (text.includes("\0")) continue;

    const rel = toWorkspaceRelative(ctx.workspaceRoot, file);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      regex.lastIndex = 0;
      if (!regex.test(lines[i]!)) continue;
      hits.push(`${rel}:${i + 1}:${lines[i]}`);
      if (hits.length >= MAX_MATCHES) {
        return [
          `path\t${toWorkspaceRelative(ctx.workspaceRoot, root)}`,
          `pattern\t${pattern}`,
          `truncated\ttrue`,
          ...hits,
        ].join("\n");
      }
    }
  }

  return [
    `path\t${toWorkspaceRelative(ctx.workspaceRoot, root)}`,
    `pattern\t${pattern}`,
    `truncated\tfalse`,
    ...hits,
  ].join("\n");
}
