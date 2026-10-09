/**
 * 读取用户 `@` 选中的工作区文件，组装 `<context_files>` 块。
 */
import fs from "node:fs";
import path from "node:path";

const MAX_FILE_BYTES = 100 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024;

/** 规范化相对路径并限制在 workspace 内。 */
function resolveSafe(workspaceRoot: string, rel: string): string | null {
  const cleaned = rel.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!cleaned || cleaned.includes("\0")) return null;
  const abs = path.resolve(workspaceRoot, cleaned);
  const root = path.resolve(workspaceRoot);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function isProbablyBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * @returns 注入文本（可空）与估算用纯文本。
 */
export function loadContextFilesBlock(
  workspaceRoot: string | null | undefined,
  contextPaths: string[] | undefined,
): { text: string; plain: string } {
  if (!workspaceRoot?.trim() || !contextPaths?.length) {
    return { text: "", plain: "" };
  }
  const root = workspaceRoot.trim();
  const parts: string[] = [];
  let total = 0;
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
    if (!st.isFile()) {
      parts.push(`<file path="${display}">\nskipped: not a file\n</file>`);
      continue;
    }
    if (st.size > MAX_FILE_BYTES) {
      parts.push(
        `<file path="${display}">\nskipped: too large (${st.size} bytes)\n</file>`,
      );
      continue;
    }
    if (total + st.size > MAX_TOTAL_BYTES) {
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
    if (isProbablyBinary(buf)) {
      parts.push(`<file path="${display}">\nskipped: binary\n</file>`);
      continue;
    }
    total += buf.length;
    const body = buf.toString("utf8");
    parts.push(`<file path="${display}">\n${body}\n</file>`);
  }
  if (parts.length === 0) return { text: "", plain: "" };
  const inner = parts.join("\n");
  const text = `<context_files>\n${inner}\n</context_files>`;
  return { text, plain: text };
}
