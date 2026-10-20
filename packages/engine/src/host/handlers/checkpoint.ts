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
    await ctx.ensureRuntime().clearThreadCheckpoints(message.threadId);
    finish(true);
  } catch (err) {
    finish(false, err instanceof Error ? err.message : String(err));
  }
}
