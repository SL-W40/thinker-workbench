import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "packages", "desktop", "resources");
const destDir = path.join(root, "packages", "desktop", "artifacts");

fs.mkdirSync(destDir, { recursive: true });

for (const name of [
  "icon.png",
  "icon.ico",
  "icon-512.png",
  "toast-icon.png",
  "toast-icon.ico",
  "logo-glyph.png",
  "logo-glyph.ico",
]) {
  const from = path.join(srcDir, name);
  if (!fs.existsSync(from)) continue;
  fs.copyFileSync(from, path.join(destDir, name));
}

/** 递归复制内置 skills 到 artifacts/skills，供主进程打包/开发旁路读取。 */
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

/** 内置目录：skills + Customize 默认资源。 */
for (const folder of ["skills", "rules", "agents", "mcps"]) {
  const from = path.join(srcDir, folder);
  const to = path.join(destDir, folder);
  if (!fs.existsSync(from)) continue;
  fs.rmSync(to, { recursive: true, force: true });
  copyDir(from, to);
}
