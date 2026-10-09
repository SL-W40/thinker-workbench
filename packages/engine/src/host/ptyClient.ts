/**
 * Engine → main PTY 请求客户端（requestId 往返）。
 */
import { createId, type UtilityPtyEvent, type UtilityPtyRequest } from "@thinker-workbench/shared";
import { postToParent } from "./port";
import { getRunIds } from "../runtime/runEmit";

type Pending = {
  resolve: (event: UtilityPtyEvent) => void;
  reject: (err: Error) => void;
  onData?: (data: string, sessionId?: string) => void;
};

const pending = new Map<string, Pending>();

/** 主进程 ptyEvent 到达。 */
export function handlePtyEvent(event: UtilityPtyEvent): void {
  const p = pending.get(event.requestId);
  if (!p) return;
  if (event.phase === "data") {
    p.onData?.(event.data ?? "", event.sessionId);
    return;
  }
  pending.delete(event.requestId);
  if (event.phase === "error") {
    p.reject(new Error(event.error || "PTY error"));
    return;
  }
  p.resolve(event);
}

export type PtyExecResult = {
  sessionId: string;
  output: string;
  exitCode: number | null;
  backgrounded: boolean;
};

/** 执行一条命令并等待 result。 */
export function ptyExec(
  options: {
    command: string;
    workingDirectory?: string;
    blockUntilMs?: number;
    onData?: (data: string, sessionId?: string) => void;
  },
  signal?: AbortSignal,
): Promise<PtyExecResult> {
  const requestId = createId("pty");
  const ids = getRunIds();
  const req: UtilityPtyRequest = {
    channel: "utility",
    kind: "ptyRequest",
    requestId,
    action: "exec",
    command: options.command,
    workingDirectory: options.workingDirectory,
    blockUntilMs: options.blockUntilMs,
    runId: ids?.runId,
    threadId: ids?.threadId,
  };

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Run cancelled."));
      return;
    }
    const onAbort = () => {
      pending.delete(requestId);
      // 尽力杀掉
      try {
        postToParent({
          channel: "utility",
          kind: "ptyRequest",
          requestId: createId("ptykill"),
          action: "kill",
          sessionId: undefined,
        });
      } catch {
        /* ignore */
      }
      reject(new Error("Run cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    pending.set(requestId, {
      onData: options.onData,
      resolve: (event) => {
        signal?.removeEventListener("abort", onAbort);
        resolve({
          sessionId: event.sessionId ?? "",
          output: event.output ?? "",
          exitCode: event.exitCode ?? null,
          backgrounded: Boolean(event.backgrounded),
        });
      },
      reject: (err) => {
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      },
    });

    postToParent(req);
  });
}

/** 等待已有 session。 */
export function ptyAwait(
  options: {
    sessionId: string;
    blockUntilMs?: number;
    pattern?: string;
    onData?: (data: string, sessionId?: string) => void;
  },
  signal?: AbortSignal,
): Promise<PtyExecResult> {
  const requestId = createId("pty");
  const req: UtilityPtyRequest = {
    channel: "utility",
    kind: "ptyRequest",
    requestId,
    action: "await",
    sessionId: options.sessionId,
    blockUntilMs: options.blockUntilMs,
    pattern: options.pattern,
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
      onData: options.onData,
      resolve: (event) => {
        signal?.removeEventListener("abort", onAbort);
        resolve({
          sessionId: event.sessionId ?? options.sessionId,
          output: event.output ?? "",
          exitCode: event.exitCode ?? null,
          backgrounded: Boolean(event.backgrounded),
        });
      },
      reject: (err) => {
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      },
    });

    postToParent(req);
  });
}
