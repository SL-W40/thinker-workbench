import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "packages", "desktop", "resources");
const destDir = path.join(root, "packages", "desktop", "artifacts");

fs.mkdirSync(destDir, { recursive: true });

/** 递归复制（跳过点文件）。 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else if (ent.isFile()) fs.copyFileSync(from, to);
  }
}

/** 共享字标（各平台通用）。 */
for (const name of ["logo-glyph.png", "logo-glyph.ico"]) {
  const from = path.join(srcDir, name);
  if (!fs.existsSync(from)) continue;
  fs.copyFileSync(from, path.join(destDir, name));
}

/**
 * OS 图标分平台：`win/` 旧版大图标，`mac/` 新版。
 * 整目录拷到 artifacts，运行时按 process.platform 解析。
 */
for (const platform of ["win", "mac"]) {
  const from = path.join(srcDir, platform);
  if (!fs.existsSync(from)) continue;
  const to = path.join(destDir, platform);
  fs.rmSync(to, { recursive: true, force: true });
  copyDir(from, to);
}

/** 内置目录：skills + Customize 默认资源。 */
for (const folder of ["skills", "rules", "agents", "mcps"]) {
  const from = path.join(srcDir, folder);
  const to = path.join(destDir, folder);
  if (!fs.existsSync(from)) continue;
  fs.rmSync(to, { recursive: true, force: true });
  copyDir(from, to);
}
