/**
 * Engine → main 的只读 Git 检视客户端（requestId 往返，镜像 ptyClient 写法）。
 *
 * Git 二进制只在主进程可见，这里只负责发请求、配对响应、处理取消；
 * 具体的 git 调用与输出压缩在桌面侧 `handleGitRequest` 完成。
 */
import { createId, type GitRequestAction, type UtilityGitRequest } from "@thinker-workbench/shared";
import { getRunIds } from "../runtime/runEmit";
import { postToParent } from "./port";

type Pending = {
  resolve: (result: GitInspectResult) => void;
  reject: (err: Error) => void;
};

/** 只读检视结果。 */
export type GitInspectResult = {
  output: string;
  truncated: boolean;
};

const pending = new Map<string, Pending>();

/** 主进程 gitResult 到达（data 阶段目前只透传，终态为 result / error）。 */
export function handleGitResult(message: {
  requestId?: string;
  phase?: string;
  output?: string;
  error?: string;
  truncated?: boolean;
}): void {
  const requestId = message.requestId ?? "";
  const p = pending.get(requestId);
  if (!p) return;
  if (message.phase === "data") return;
  pending.delete(requestId);
  if (message.phase === "error") {
    p.reject(new Error(message.error || "Git request failed"));
    return;
  }
  p.resolve({ output: message.output ?? "", truncated: Boolean(message.truncated) });
}

/** run 取消时清理挂起请求，避免 Promise 永远悬着。 */
export function rejectPendingGitRequests(reason = "Run cancelled."): void {
  if (pending.size === 0) return;
  for (const [, p] of pending) p.reject(new Error(reason));
  pending.clear();
}

/**
 * 发起一次只读 Git 检视。
 * @param action status / diff
 * @param options.paths diff 的目标路径；省略表示全部改动
 * @param options.contextLines unified diff 上下文行数
 * @param options.maxChars 输出字符上限（截断保护）
 */
export function gitInspect(
  action: GitRequestAction,
  options: {
    paths?: string[];
    contextLines?: number;
    maxChars?: number;
  } = {},
  signal?: AbortSignal,
): Promise<GitInspectResult> {
  const requestId = createId("git");
  const ids = getRunIds();
  const req: UtilityGitRequest = {
    channel: "utility",
    kind: "gitRequest",
    requestId,
    action,
    runId: ids?.runId,
    threadId: ids?.threadId,
    paths: options.paths?.length ? options.paths : undefined,
    contextLines: options.contextLines,
    maxChars: options.maxChars,
  };

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Run cancelled."));
      return;
    }
    const onAbort = () => {
      pending.delete(requestId);
      reject(new Error("Run cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    pending.set(requestId, {
      resolve: (result) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(result);
      },
      reject: (err) => {
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      },
    });

    postToParent(req);
  });
}
