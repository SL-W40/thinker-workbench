/**
 * 启动产品 Electron（macOS 用具名 .app，使强制退出显示正确名称）。
 * 用法：node scripts/run-electron.mjs [product] -- [electron args...]
 *
 * nodemon / concurrently 重启时会向本进程发信号；须转发给 Electron 子进程，
 * 否则子进程变孤儿（PPID=1），再启会撞单实例锁或叠窗。
 */
import { spawn } from "node:child_process";
import { resolveElectronLaunch } from "./electron-mac-app.mjs";

const roleArg = process.argv[2];
const role = !roleArg || roleArg === "--" || roleArg === "product" ? "product" : null;
if (!role) {
  console.error("Usage: node scripts/run-electron.mjs [product] -- [electron args...]");
  process.exit(1);
}

const dash = process.argv.indexOf("--");
const electronArgs =
  dash >= 0
    ? process.argv.slice(dash + 1)
    : roleArg === "product"
      ? process.argv.slice(3)
      : process.argv.slice(2);

const { bin, shell } = resolveElectronLaunch("product");

/** @type {import("node:child_process").ChildProcess | null} */
let child = null;
/** 已开始收尾，避免信号与 exit 重复杀。 */
let shuttingDown = false;

/**
 * 杀掉 Electron 子进程（Windows 用 taskkill 树杀，避免 shell 包装残留）。
 * @param {NodeJS.Signals | number} [signal]
 */
function killChild(signal = "SIGTERM") {
  if (!child?.pid) return;
  const pid = child.pid;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    process.kill(pid, signal);
  } catch {
    /* 已退出 */
  }
}

/**
 * @param {NodeJS.Signals} signal
 */
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  killChild(signal);
  // 给子进程一点时间优雅退出；超时再强杀
  const force = setTimeout(() => {
    killChild("SIGKILL");
    process.exit(1);
  }, 3000);
  force.unref?.();
  child?.once("exit", (code, sig) => {
    clearTimeout(force);
    if (sig) {
      process.exit(1);
      return;
    }
    process.exit(code ?? 0);
  });
  if (!child || child.exitCode !== null) {
    clearTimeout(force);
    process.exit(0);
  }
}

child = spawn(bin, electronArgs, {
  stdio: "inherit",
  shell,
  env: {
    ...process.env,
    // 供主进程轮询：包装进程被 SIGKILL 时也能自退，避免孤儿占锁
    TW_DEV_PARENT_PID: String(process.pid),
  },
});

child.on("error", (err) => {
  console.error("[run-electron]", err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 1);
});

for (const sig of /** @type {const} */ (["SIGTERM", "SIGINT", "SIGHUP"])) {
  process.on(sig, () => shutdown(sig));
}

// 同步收尾兜底（部分宿主只触发 exit、不转发信号）
process.on("exit", () => {
  if (!shuttingDown) killChild("SIGKILL");
});
