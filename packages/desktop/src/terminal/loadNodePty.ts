/**
 * 加载 node-pty（必须走 Node require，不可被 esbuild 打进 main bundle）。
 * 打进 bundle 后 `../build/Release/conpty.node` 会相对 artifacts/ 解析而失败。
 */
import { createRequire } from "node:module";
import type * as NodePty from "node-pty";

const require = createRequire(__filename);

/** 已解析的 node-pty 模块。 */
let cached: typeof NodePty | null = null;

/** 获取 node-pty；首次 require 失败时抛出可读错误。 */
export function loadNodePty(): typeof NodePty {
  if (cached) return cached;
  try {
    cached = require("node-pty") as typeof NodePty;
    return cached;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load node-pty native module (conpty.node / pty.node). ` +
        `Run: pnpm --filter @thinker-workbench/desktop run rebuild:native. ` +
        `Cause: ${msg}`,
    );
  }
}
