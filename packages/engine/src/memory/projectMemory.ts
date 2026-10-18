/**
 * 静态项目记忆加载器（可配置来源，替代桌面硬编码 THINKER.md/CLAUDE.md）。
 *
 * 与引擎既有的 loadRules（始终注入 .thinker/rules）互补：
 * 这里只加载显式配置的来源（如 THINKER.md / CLAUDE.md / AGENTS.md / docs/），
 * 按来源与全局字符预算截断，拼接为可注入系统段的文本。
 */

import fs from "node:fs";
import path from "node:path";
import type { ProjectMemoryLoader, ProjectMemorySource } from "./repository";

/** 跳过的目录（避免扫 node_modules / .git 等）。 */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  "target",
  "bin",
  "obj",
  ".turbo",
  "coverage",
  ".thinker",
]);

/** 仅读取这些文本扩展名，避免把二进制塞进记忆。 */
const TEXT_EXTS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".text",
  ".rst",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".log",
]);

/** 全局字符上限（防记忆撑爆上下文）。 */
const GLOBAL_CHAR_CAP = 32_000;

/** 默认项目记忆来源（可按 settings 覆盖；不含 .thinker/rules，已由 loadRules 注入）。 */
export const DEFAULT_PROJECT_MEMORY_SOURCES: ProjectMemorySource[] = [
  { pattern: "THINKER.md", maxChars: 8_000 },
  { pattern: "CLAUDE.md", maxChars: 8_000 },
  { pattern: "AGENTS.md", maxChars: 6_000 },
  { pattern: "docs", maxChars: 12_000, recursive: true },
];

function isTextFile(name: string): boolean {
  return TEXT_EXTS.has(path.extname(name).toLowerCase());
}

/** 递归收集目录下文本文件（绝对路径）。 */
function walkTextFiles(dir: string, recursive: boolean, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      if (recursive) walkTextFiles(abs, recursive, out);
    } else if (ent.isFile() && isTextFile(ent.name)) {
      out.push(abs);
    }
  }
}

/** 解析单个来源为候选文件列表。 */
function resolveSource(root: string, source: ProjectMemorySource): string[] {
  const abs = path.resolve(root, source.pattern);
  const found: string[] = [];
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(abs);
  } catch {
    stat = undefined;
  }
  if (stat?.isFile()) {
    found.push(abs);
    return found;
  }
  if (stat?.isDirectory()) {
    walkTextFiles(abs, source.recursive ?? true, found);
    return found;
  }
  // 形如 *.md 或文件名：从 root 递归匹配基名
  const base = path.basename(source.pattern);
  const extMatch = base.startsWith("*.") ? base.slice(1).toLowerCase() : null;
  walkTextFiles(root, true, found);
  return found.filter((f) => {
    const b = path.basename(f).toLowerCase();
    return extMatch ? b.endsWith(extMatch) : b === base.toLowerCase();
  });
}

function readTextSafe(file: string, maxChars?: number): string | null {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return null;
    // 明显过大的文件直接跳过（避免误读二进制/巨文件）
    if (maxChars != null && stat.size > maxChars * 8) return null;
    const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    return maxChars != null ? text.slice(0, maxChars) : text;
  } catch {
    return null;
  }
}

/** 项目记忆加载器实现。 */
export class ProjectMemoryLoaderImpl implements ProjectMemoryLoader {
  async load(workspaceRoot: string, sources: ProjectMemorySource[]): Promise<string> {
    const root = workspaceRoot?.trim() || process.cwd();
    const parts: string[] = [];
    let total = 0;
    for (const source of sources) {
      const files = resolveSource(root, source);
      for (const f of files) {
        const rel = path.relative(root, f).replace(/\\/g, "/");
        const text = readTextSafe(f, source.maxChars);
        if (!text?.trim()) continue;
        const block = `\n\n<!-- project memory: ${rel} -->\n${text.trim()}`;
        if (total + block.length >= GLOBAL_CHAR_CAP) {
          const remaining = GLOBAL_CHAR_CAP - total;
          if (remaining > 200) parts.push(block.slice(0, remaining));
          total = GLOBAL_CHAR_CAP;
          break;
        }
        parts.push(block);
        total += block.length;
      }
      if (total >= GLOBAL_CHAR_CAP) break;
    }
    return parts.join("").trim();
  }
}

/** 默认加载器实例。 */
export const defaultProjectMemoryLoader = new ProjectMemoryLoaderImpl();
