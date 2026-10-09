/**
 * 启动产品 Electron（macOS 用具名 .app，使强制退出显示正确名称）。
 * 用法：node scripts/run-electron.mjs [product] -- [electron args...]
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
const child = spawn(bin, electronArgs, {
  stdio: "inherit",
  shell,
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
