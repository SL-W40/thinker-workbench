/**
 * checkpointClear：主进程请求清理会话线程 checkpoint（删会话等场景）。
 */
import type { UtilityCheckpointClear } from "@thinker-workbench/shared";
import type { HostContext } from "../hostContext";
import { postToParent } from "../port";

export async function onCheckpointClear(
  ctx: HostContext,
  message: UtilityCheckpointClear,
): Promise<void> {
  const finish = (ok: boolean, error?: string) => {
    postToParent({
      channel: "utility",
      kind: "checkpointClearResult",
      requestId: message.requestId,
      ok,
      ...(error ? { error } : {}),
    });
  };
  try {
    const dir = message.checkpointDir?.trim();
    if (dir) {
      // 目录即工作区：打开对应 runtime 再删，避免「还没跑过所以没 runtime」把登记留下
      await ctx.ensureRuntime(dir).clearThreadCheckpoints(message.threadId);
    } else {
      for (const runtime of ctx.listRuntimes()) {
        await runtime.clearThreadCheckpoints(message.threadId);
      }
    }
    finish(true);
  } catch (err) {
    finish(false, err instanceof Error ? err.message : String(err));
  }
}
