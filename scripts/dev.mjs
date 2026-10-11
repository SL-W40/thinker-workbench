/**
 * 开发入口：`pnpm run dev [-- --no-hot] [-- --devtools]`
 *
 * --no-hot（或 TW_DEV_NO_HOT=1）：
 * - Vite 关闭 HMR（UI 不热更新）
 * - Electron 单次启动，不用 nodemon（main/preload/engine 变更不重启）
 * 后台 tsc/esbuild watch 仍跑，只改磁盘、不推到运行中的应用。
 *
 * --devtools（或 THINKER_OPEN_DEVTOOLS=1）：
 * - 启动后自动打开主窗 DevTools（detach）
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** pnpm 可能传入单独的 `--`，忽略。 */
const argv = process.argv.slice(2).filter((a) => a !== "--");

function flag(name, envKeys) {
  if (argv.includes(name)) return true;
  return envKeys.some((k) => process.env[k] === "1" || process.env[k] === "true");
}

const noHot = flag("--no-hot", ["TW_DEV_NO_HOT"]);
const openDevtools = flag("--devtools", ["THINKER_OPEN_DEVTOOLS"]);

const env = {
  ...process.env,
  ...(noHot ? { TW_DEV_NO_HOT: "1" } : {}),
  ...(openDevtools ? { THINKER_OPEN_DEVTOOLS: "1" } : {}),
};

function runSync(command, args) {
  const r = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

runSync("node", ["scripts/copy-desktop-resources.mjs"]);
runSync("node", ["scripts/dev-prepare.mjs"]);

if (noHot) {
  console.log("[dev] --no-hot: Vite HMR 关闭，Electron 不自动重启");
  // once 模式不会等 esbuild watch 写完；先打一枪，避免用到半截/过期的 main
  console.log("[dev] --no-hot: 预编译 desktop main/preload + engine entry …");
  runSync("pnpm", ["--filter", "@thinker-workbench/desktop", "run", "bundle:main"]);
  runSync("pnpm", ["--filter", "@thinker-workbench/desktop", "run", "bundle:preload"]);
  runSync("pnpm", ["--filter", "@thinker-workbench/engine", "run", "bundle:entry"]);
}
if (openDevtools) {
  console.log("[dev] --devtools: 启动后打开 DevTools");
}

const electronScript = noHot ? "pnpm:dev:electron:once" : "pnpm:dev:electron";

const concurrentlyArgs = [
  "-k",
  "--kill-signal",
  "SIGKILL",
  "--pad-prefix",
  "-n",
  "shared,logger,eng-tsc,eng,desk-tsc,desk,preload,ui,app",
  "-c",
  "magenta,red,cyan,cyanBright,blue,blueBright,blueBright,green,yellow",
  "pnpm:dev:shared",
  "pnpm:dev:logger",
  "pnpm:dev:engine:tsc",
  "pnpm:dev:engine:esbuild",
  "pnpm:dev:desktop:tsc",
  "pnpm:dev:desktop:main",
  "pnpm:dev:desktop:preload",
  "pnpm:dev:renderer",
  electronScript,
];

const child = spawn("pnpm", ["exec", "concurrently", ...concurrentlyArgs], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
