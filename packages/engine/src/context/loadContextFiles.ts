/**
 * 读取用户 `@` 选中的工作区文件 / 目录，组装 `<context_files>` 块。
 * 目录注入浅层文件名列表（`<directory>`），不递归读入文件内容。
 *
 * 文档类（pdf/doc/docx/xls…）走可插拔解析层抽纯文本，
 * 与既有的「文本文件原样注入」并入同一 `<context_files>` 块。
 */
import fs from "node:fs";
import path from "node:path";
import { parseFile } from "@thinker-workbench/file-parsers";
import { getLimit } from "../config/runtimeLimits";

/** 规范化相对路径并限制在 workspace 内。 */
function resolveSafe(workspaceRoot: string, rel: string): string | null {
  const cleaned = rel.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!cleaned || cleaned.includes("\0")) return null;
  const abs = path.resolve(workspaceRoot, cleaned);
  const root = path.resolve(workspaceRoot);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/**
 * @returns 注入文本（可空）与估算用纯文本。
 */
export async function loadContextFilesBlock(
  workspaceRoot: string | null | undefined,
  contextPaths: string[] | undefined,
): Promise<{ text: string; plain: string }> {
  const parts: string[] = [];
  let total = 0;
  const maxFile = getLimit("contextFilesMaxFileBytes");
  const maxTotal = getLimit("contextFilesMaxTotalBytes");

  if (!workspaceRoot?.trim() || !contextPaths?.length) {
    return { text: "", plain: "" };
  }

  const root = workspaceRoot.trim();
  for (const rel of contextPaths) {
    const abs = resolveSafe(root, rel);
    const display = rel.replace(/\\/g, "/");
    if (!abs) {
      parts.push(`<file path="${display}">\nskipped: path outside workspace\n</file>`);
      continue;
    }
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      parts.push(`<file path="${display}">\nskipped: not found\n</file>`);
      continue;
    }
    if (st.isDirectory()) {
      // 目录：注入浅层文件名列表（不递归读内容），供模型知道结构
      let names: string[];
      try {
        names = fs.readdirSync(abs).sort((a, b) => a.localeCompare(b));
      } catch {
        parts.push(
          `<directory path="${display.replace(/\/$/, "")}">\nskipped: read error\n</directory>`,
        );
        continue;
      }
      const dirPath = display.replace(/\/$/, "") || display;
      const listing = names.length ? names.join("\n") : "(empty)";
      const body = `${listing}\n`;
      if (total + Buffer.byteLength(body, "utf8") > maxTotal) {
        parts.push(
          `<directory path="${dirPath}">\nskipped: total context budget exceeded\n</directory>`,
        );
        continue;
      }
      total += Buffer.byteLength(body, "utf8");
      parts.push(`<directory path="${dirPath}">\n${body}</directory>`);
      continue;
    }
    if (!st.isFile()) {
      parts.push(`<file path="${display}">\nskipped: not a file\n</file>`);
      continue;
    }
    if (st.size > maxFile) {
      parts.push(`<file path="${display}">\nskipped: too large (${st.size} bytes)\n</file>`);
      continue;
    }
    if (total + st.size > maxTotal) {
      parts.push(`<file path="${display}">\nskipped: total context budget exceeded\n</file>`);
      continue;
    }
    let buf: Buffer;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      parts.push(`<file path="${display}">\nskipped: read error\n</file>`);
      continue;
    }
    total += st.size;
    const parsed = await parseFile({ bytes: new Uint8Array(buf), name: display });
    if (parsed.text?.trim()) {
      parts.push(`<file path="${display}">\n${parsed.text}\n</file>`);
      continue;
    }
    parts.push(`<file path="${display}">\nskipped: binary or unreadable\n</file>`);
  }

  if (parts.length === 0) return { text: "", plain: "" };
  const inner = parts.join("\n");
  const text = `<context_files>\n${inner}\n</context_files>`;
  return { text, plain: text };
}
