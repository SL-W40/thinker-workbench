/**
 * 开发启动前确保 workspace 库产物存在。
 * 各包 artifacts 被 gitignore；冷启动时 eng/desk esbuild 会抢跑并报
 * Could not resolve "@thinker-workbench/logger"。已存在则跳过，避免拖慢热启动。
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ pkg: string; files: string[] }[]} */
const steps = [
  {
    pkg: "@thinker-workbench/shared",
    files: ["packages/shared/artifacts/index.js"],
  },
  {
    pkg: "@thinker-workbench/logger",
    files: [
      "packages/logger/artifacts/index.js",
      "packages/logger/artifacts/node/index.js",
    ],
  },
];

function missing(files) {
  return files.some((f) => !existsSync(path.join(root, f)));
}

let built = 0;
for (const step of steps) {
  if (!missing(step.files)) continue;
  console.log(`[dev:prepare] building ${step.pkg} …`);
  const r = spawnSync("pnpm", ["--filter", step.pkg, "build"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
  built += 1;
}

if (built === 0) {
  console.log("[dev:prepare] shared/logger artifacts ready");
}
