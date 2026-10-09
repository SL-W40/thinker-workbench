/**
 * utilityProcess 与 Electron 主进程之间的 parentPort 薄封装。
 * 本包禁止直接依赖 `electron`，只通过 Node 注入的 `process.parentPort` 收发消息。
 */
import type { UtilityToParent } from "@thinker-workbench/shared";

/** 主进程注入的双向端口形状（与 Electron utilityProcess 一致）。 */
type ParentPort = {
  postMessage: (message: unknown) => void;
  on: (event: "message", listener: (event: { data: unknown }) => void) => void;
};

/** 取 parentPort；不在 utilityProcess 里时返回 null。 */
export function getParentPort(): ParentPort | null {
  const port = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort;
  return port ?? null;
}

/** 向主进程投递 UtilityToParent 消息；端口不可用时抛错。 */
export function postToParent(message: UtilityToParent): void {
  const port = getParentPort();
  if (!port) {
    throw new Error("utilityProcess parentPort is unavailable.");
  }
  port.postMessage(message);
}
