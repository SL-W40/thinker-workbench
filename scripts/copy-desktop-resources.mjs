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
