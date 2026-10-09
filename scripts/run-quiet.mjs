/**
 * 运行子进程并过滤开发态噪音行（主要是 tsc watch 成功心跳）。
 * 用法：node scripts/run-quiet.mjs -- <command> [args...]
 */
import { spawn } from "node:child_process";

const dash = process.argv.indexOf("--");
const argv = dash >= 0 ? process.argv.slice(dash + 1) : process.argv.slice(2);
if (argv.length === 0) {
  console.error("Usage: node scripts/run-quiet.mjs -- <command> [args...]");
  process.exit(1);
}

const ANSI = /\u001b\[[0-9;]*m/g;

/** 去掉 ANSI 后再匹配；成功路径的心跳整行丢弃 */
const DROP = [
  /File change detected\. Starting incremental compilation/i,
  /Found 0 errors\. Watching for file changes\./i,
];

/**
 * @param {import('node:stream').Readable | null} stream
 * @param {NodeJS.WriteStream} out
 * @returns {Promise<void>}
 */
function pipeFiltered(stream, out) {
  if (!stream) return Promise.resolve();
  return new Promise((resolve) => {
    let buf = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const plain = line.replace(ANSI, "").trim();
        // 丢弃心跳成功行，以及过滤后残留的空行（concurrently 前缀会显得刷屏）
        if (!plain || DROP.some((re) => re.test(plain))) continue;
        out.write(`${line}\n`);
      }
    });
    stream.on("end", () => {
      if (buf) {
        const plain = buf.replace(ANSI, "").trim();
        if (plain && !DROP.some((re) => re.test(plain))) {
          out.write(buf.endsWith("\n") ? buf : `${buf}\n`);
        }
      }
      resolve();
    });
    stream.on("error", () => resolve());
  });
}

const [command, ...args] = argv;
const child = spawn(command, args, {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
  env: process.env,
});

const drained = Promise.all([
  pipeFiltered(child.stdout, process.stdout),
  pipeFiltered(child.stderr, process.stderr),
]);

for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  void drained.finally(() => {
    if (signal) {
      try {
        process.kill(process.pid, signal);
      } catch {
        process.exit(1);
      }
      return;
    }
    process.exit(code ?? 1);
  });
});
