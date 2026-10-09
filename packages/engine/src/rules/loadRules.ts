/**
 * 加载全局 + 工作空间 Rules 文本（始终注入）。
 *
 * 路径（后者同名文件按遍历顺序追加，不覆盖）：
 * 1. `<dataDir>/rules/`
 * 2. `<workspaceRoot>/.thinker/rules/`
 * 3. `<workspaceRoot>/.cursor/rules/`（兼容 Cursor 项目）
 * 递归读取 `.md` / `.mdc` / `.txt`，按相对路径排序拼接。
 */
import fs from "node:fs";
import path from "node:path";

const RULE_EXTS = new Set([".md", ".mdc", ".txt"]);

/** 递归收集目录下规则文件（相对路径 → 绝对路径）。 */
function walkRuleFiles(root: string): Array<{ rel: string; abs: string }> {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const out: Array<{ rel: string; abs: string }> = [];
  const walk = (dir: string, prefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const abs = path.join(dir, ent.name);
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        walk(abs, rel);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!RULE_EXTS.has(ext)) continue;
      out.push({ rel: rel.replace(/\\/g, "/"), abs });
    }
  };
  walk(root, "");
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

/** 读取单个规则文件；失败返回空。 */
function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

export type LoadedRules = {
  /** 拼进 system 的完整块（无文件时为空串）。 */
  text: string;
  /** 参与拼接的文件数。 */
  fileCount: number;
};

/**
 * 加载并拼接 rules。
 * @param dataDir 应用数据根；空则跳过全局
 * @param workspaceRoot 工作区根；空则跳过工作区
 */
export function loadRules(
  dataDir: string | null | undefined,
  workspaceRoot: string | null | undefined,
): LoadedRules {
  const sections: string[] = [];
  let fileCount = 0;

  const roots: Array<{ label: string; root: string }> = [];
  if (dataDir?.trim()) {
    roots.push({ label: "global", root: path.join(dataDir.trim(), "rules") });
  }
  if (workspaceRoot?.trim()) {
    const ws = workspaceRoot.trim();
    roots.push({ label: "thinker", root: path.join(ws, ".thinker", "rules") });
    // 与 loadSkills 一致：兼容 Cursor 项目规则目录
    roots.push({ label: "cursor", root: path.join(ws, ".cursor", "rules") });
  }

  for (const { label, root } of roots) {
    for (const file of walkRuleFiles(root)) {
      const body = readText(file.abs).trim();
      if (!body) continue;
      fileCount += 1;
      sections.push(`### ${label}:${file.rel}\n\n${body}`);
    }
  }

  if (sections.length === 0) return { text: "", fileCount: 0 };
  return {
    text: ["## Rules", "", "Follow these project rules:", "", ...sections].join("\n"),
    fileCount,
  };
}
