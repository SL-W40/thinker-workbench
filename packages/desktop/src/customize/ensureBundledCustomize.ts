/**
 * 把应用内置 Customize 资源同步到 dataDir（rules / agents / mcps）。
 * 仅在目标尚不存在时复制，避免覆盖用户已改内容。
 * Skills 由 ensureBundledSkills 单独处理。
 */
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "../config/paths";

type BundledKind = "rules" | "agents" | "mcps";

/** 在 resources 旁路查找内置目录。 */
function findBundledDir(kind: BundledKind): string {
  const bases = [path.join(__dirname, "..", "resources"), __dirname];
  for (const base of bases) {
    const candidate = path.join(base, kind);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return "";
}

/** 递归复制「仅当目标不存在」。 */
function copyMissing(src: string, dest: string, installed: string[]): void {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      copyMissing(path.join(src, ent.name), path.join(dest, ent.name), installed);
    }
    return;
  }
  if (!st.isFile()) return;
  if (fs.existsSync(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.copyFileSync(src, dest);
    installed.push(dest);
  } catch {
    /* 单文件失败不阻断启动 */
  }
}

/**
 * 确保内置 Customize 默认资源出现在当前 dataDir。
 * @returns 新复制的绝对路径列表
 */
export function ensureBundledCustomize(): string[] {
  const dataDir = getDataDir();
  const installed: string[] = [];
  const kinds: BundledKind[] = ["rules", "agents", "mcps"];
  for (const kind of kinds) {
    const bundled = findBundledDir(kind);
    if (!bundled) continue;
    const destRoot = path.join(dataDir, kind);
    fs.mkdirSync(destRoot, { recursive: true });
    try {
      for (const ent of fs.readdirSync(bundled, { withFileTypes: true })) {
        if (ent.name.startsWith(".")) continue;
        copyMissing(path.join(bundled, ent.name), path.join(destRoot, ent.name), installed);
      }
    } catch {
      /* 单 kind 失败不阻断 */
    }
  }
  return installed;
}
