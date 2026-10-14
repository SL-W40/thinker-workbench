/**
 * 等待一组产物文件 mtime 安静一段时间（无新增写入）。
 * 用于 `pnpm:dev`：esbuild --watch 首轮会陆续改写 main/preload/entry，
 * 若此时已启动 nodemon，会必然再重启一次 Electron（窗开一下又关再开）。
 */
import fs from "node:fs";
import path from "node:path";

/**
 * @param {string[]} absPaths
 * @returns {string} 用逗号拼接的 mtime；缺失文件为 -1
 */
export function artifactMtimeKey(absPaths) {
  return absPaths
    .map((p) => {
      try {
        return String(fs.statSync(p).mtimeMs);
      } catch {
        return "-1";
      }
    })
    .join(",");
}

/**
 * @param {object} opts
 * @param {string[]} opts.files 绝对路径
 * @param {number} [opts.quietMs=1500] 连续无变化多久算稳定
 * @param {number} [opts.pollMs=200]
 * @param {number} [opts.timeoutMs=120000]
 * @param {() => number} [opts.now]
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @param {(files: string[]) => string} [opts.keyOf]
 */
export async function waitForArtifactsSettle(opts) {
  const {
    files,
    quietMs = 1500,
    pollMs = 200,
    timeoutMs = 120_000,
    now = () => Date.now(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    keyOf = artifactMtimeKey,
  } = opts;

  const start = now();
  let last = keyOf(files);
  let lastChange = start;

  while (now() - start < timeoutMs) {
    await sleep(pollMs);
    const next = keyOf(files);
    // 仍有文件未出现：不算稳定
    if (next.split(",").includes("-1")) {
      last = next;
      lastChange = now();
      continue;
    }
    if (next !== last) {
      last = next;
      lastChange = now();
      continue;
    }
    if (now() - lastChange >= quietMs) return;
  }

  throw new Error(
    `artifacts did not settle within ${timeoutMs}ms: ${files.map((f) => path.basename(f)).join(", ")}`,
  );
}
