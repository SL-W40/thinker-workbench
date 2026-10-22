/**
 * grep 实现：遍历文本类文件，按行匹配正则，输出 `相对路径:行号:内容`。
 *
 * 定位器定位：命中行只截展示内容（`path:line` 指针完整，全文可 read_file 精读）；
 * 每文件配额防止单个吵闹文件挤占全局配额；命中排序保证输出确定可复现。
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { globToRegExp } from "../shared/glob";
import { clipLine } from "../shared/lines";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted, walkFiles } from "../shared/walk";
import type { ToolArgs, ToolContext } from "../types";

/** 单文件最大读取字节数。 */
const MAX_FILE_BYTES = 1_000_000;
/** 单次调用最多返回的命中行数。 */
const MAX_MATCHES = 100;
/** 单文件最多返回的命中行数（防单文件挤占全局配额）。 */
const MAX_MATCHES_PER_FILE = 20;
/** 单行展示截断长度（超出省略并标注，全文可 read_file 读回）。 */
const MAX_LINE_CHARS = 500;

/** 视为文本、值得打开的扩展名；另特判 Dockerfile。 */
const TEXTISH =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|less|css|html|yml|yaml|toml|xml|svg|sh|ps1|py|rs|go|java|kt|swift|c|cc|cpp|h|hpp|cs|sql|graphql|env|ignore|editorconfig)$/i;

/** content 模式的一条命中（收集后统一排序再格式化）。 */
type GrepHit = { rel: string; line: number; text: string };

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** 宽容解析布尔：true / "true" 为真，其余按假处理。 */
function asBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

export async function grepTool(args: ToolArgs, ctx: ToolContext): Promise<string> {
  const pattern = asString(args.pattern)?.trim() ?? "";
  if (!pattern) {
    throw new Error("Grep requires parameters.pattern (regex).");
  }

  const ignoreCase = asBoolean(args.ignore_case);
  let regex: RegExp;
  try {
    // 逐行 test，无需 g/m flag；ignore_case 等价 -i。
    regex = new RegExp(pattern, ignoreCase ? "i" : "");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid regex: ${message}`);
  }

  // output_mode 非法值回退 content（模型容错）。
  const requestedMode = asString(args.output_mode);
  const outputMode =
    requestedMode === "files" || requestedMode === "count" ? requestedMode : "content";

  const glob = asString(args.glob)?.trim();
  const globRegex = glob ? globToRegExp(glob) : null;

  const root = resolveWorkspacePath(ctx.workspaceRoot, asString(args.path), { access: "read" });
  const rootLabel = toWorkspaceRelative(ctx.workspaceRoot, root);

  const hits: GrepHit[] = [];
  const matchedFiles: string[] = [];
  const fileCounts = new Map<string, number>();
  let totalMatches = 0;
  let truncated = false;

  for await (const file of walkFiles(root, ctx.signal)) {
    throwIfAborted(ctx.signal, "Grep");
    if (globRegex) {
      const relForGlob = toWorkspaceRelative(ctx.workspaceRoot, file);
      if (!globRegex.test(relForGlob) && !globRegex.test(path.basename(file))) continue;
    }
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
    let fileMatches = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!regex.test(lines[i]!)) continue;
      fileMatches++;
      totalMatches++;
      // content 模式：每文件配额 + 全局上限双重约束，超额计入 total_matches
      if (outputMode === "content") {
        if (fileMatches <= MAX_MATCHES_PER_FILE && hits.length < MAX_MATCHES) {
          hits.push({ rel, line: i + 1, text: clipLine(lines[i]!, MAX_LINE_CHARS) });
        } else {
          truncated = true;
        }
      }
    }
    if (fileMatches > 0) {
      fileCounts.set(rel, fileMatches);
      matchedFiles.push(rel);
    }
    // 触顶早停：content 看命中数，files/count 看文件数
    if (hits.length >= MAX_MATCHES || matchedFiles.length >= MAX_MATCHES) {
      truncated = true;
      break;
    }
  }

  const rows =
    outputMode === "content"
      ? hits
          .sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line)
          .map((hit) => `${hit.rel}:${hit.line}:${hit.text}`)
      : outputMode === "files"
        ? [...matchedFiles].sort((a, b) => a.localeCompare(b))
        : [...fileCounts.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([rel, count]) => `${rel}\t${count}`);

  return [
    `path\t${rootLabel}`,
    `pattern\t${pattern}`,
    `matches\t${rows.length}`,
    `total_matches\t${totalMatches}`,
    `truncated\t${truncated}`,
    ...rows,
  ].join("\n");
}
