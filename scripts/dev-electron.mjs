/**
 * 开发态启动 Electron：
 * 1. wait-on Vite + main/preload/entry
 * 2. 等产物 mtime 安静（吃掉 esbuild --watch 首轮连写）
 * 3. 再启 nodemon（热重启）或单次 run-electron（--once / --no-hot）
 *
 * 旧链路在 wait-on 通过后立刻 nodemon，首轮 preload/entry 再写会必然「开窗→关→再开」。
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForArtifactsSettle } from "./artifacts-settle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const once = process.argv.includes("--once");

const watchedRel = [
  "packages/desktop/artifacts/main.js",
  "packages/desktop/artifacts/preload.js",
  "packages/engine/artifacts/entry.js",
];

const watchedAbs = watchedRel.map((f) => path.join(root, f));

function runWaitOn() {
  const args = ["tcp:127.0.0.1:5179", ...watchedRel.map((f) => `file:${f}`)];
  const r = spawnSync("pnpm", ["exec", "wait-on", ...args], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

console.log("[dev:electron] waiting for Vite + desktop/engine artifacts …");
runWaitOn();

console.log("[dev:electron] waiting for esbuild first-write settle …");
try {
  await waitForArtifactsSettle({ files: watchedAbs, quietMs: 1500 });
} catch (err) {
  console.error("[dev:electron]", err instanceof Error ? err.message : err);
  process.exit(1);
}

const child = once
  ? spawn("node", ["scripts/run-electron.mjs", "product", "--", "--log-level=3", "."], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
    })
  : spawn("pnpm", ["exec", "nodemon"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
