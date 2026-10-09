/**
 * 主进程 PTY 会话管理：创建 / 写 / resize / kill，并扇出到 renderer 与 agent 等待者。
 */
import {
  createId,
  IpcChannels,
  type TerminalEvent,
  type TerminalSession,
} from "@thinker-workbench/shared";
import { BrowserWindow } from "electron";
import type { IPty } from "node-pty";
import { getGeneralSettings } from "../config/settingsStore";
import { getActiveWorkspaceRoot } from "../db/workspacesStore";
import { resolveShellProfile } from "./detectShellProfiles";
import { loadNodePty } from "./loadNodePty";

type SessionRecord = {
  meta: TerminalSession;
  /** spawn 失败的幽灵会话无 proc。 */
  proc: IPty | null;
  output: string;
  /** 等待 exit / pattern 的 resolve。 */
  waiters: Array<{
    requestId: string;
    resolve: (result: PtyWaitResult) => void;
    startedAt: number;
    blockUntilMs: number;
    pattern?: RegExp;
    /** pattern 命中：done=命令结束；match=仍挂起（shell_await）。 */
    patternMode?: "done" | "match";
    timer?: ReturnType<typeof setTimeout>;
    onData?: (chunk: string) => void;
  }>;
};

export type PtyWaitResult = {
  sessionId: string;
  output: string;
  exitCode: number | null;
  backgrounded: boolean;
};

export type ExecOptions = {
  command: string;
  cwd?: string;
  blockUntilMs?: number;
  cols?: number;
  rows?: number;
  runId?: string;
  threadId?: string;
  /** 会话创建后立刻回调（便于流式事件带上 sessionId）。 */
  onSession?: (sessionId: string) => void;
  onData?: (chunk: string) => void;
};

const MAX_BUFFER = 400_000;

/** Agent 命令结束标记（OSC，xterm 通常不显示为可见文本）。 */
const DONE_OSC_RE = /\x1b\]666;done;(-?\d+)\x07/;
const DONE_PLAIN_RE = /__TW_DONE__(-?\d+)/;

function broadcast(event: TerminalEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.terminalEvent, event);
    }
  }
}

/** 供 RegExp 匹配结束标记。 */
function donePatternSource(): string {
  return "(?:\\x1b\\]666;done;-?\\d+\\x07|__TW_DONE__-?\\d+)";
}

function parseDoneExitCode(output: string): number | null {
  const osc = output.match(DONE_OSC_RE);
  if (osc) return Number(osc[1]);
  const plain = output.match(DONE_PLAIN_RE);
  if (plain) return Number(plain[1]);
  return null;
}

function stripDoneMarkers(output: string): string {
  return output
    .replace(/\x1b\]666;done;-?\d+\x07/g, "")
    .replace(/\r?\n?__TW_DONE__-?\d*\r?\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * 在用户命令后追加结束标记：命令真正退出后才打印。
 * 长驻进程（如 http server）不会打标记 → 超时后 backgrounded，会话保留。
 */
function wrapWithDoneMarker(profileId: string, command: string): string {
  const id = profileId.toLowerCase();
  if (id === "powershell" || id === "pwsh" || id.includes("powershell")) {
    return (
      `${command}; ` +
      `$__twEc = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }; ` +
      `Write-Host ("{0}]666;done;{1}{2}" -f [char]27, $__twEc, [char]7) -NoNewline`
    );
  }
  if (id === "cmd") {
    return `${command} & echo __TW_DONE__%ERRORLEVEL%`;
  }
  return `${command}; printf '\\033]666;done;%d\\007' $?`;
}

/** 按 shell 拼「回车提交」行尾。 */
function submitLine(profileId: string, command: string): string {
  const id = profileId.toLowerCase();
  if (id === "cmd") return `${command}\r\n`;
  return `${command}\r`;
}

class TerminalSessionManager {
  private readonly sessions = new Map<string, SessionRecord>();

  list(): TerminalSession[] {
    return [...this.sessions.values()].map((s) => ({ ...s.meta }));
  }

  get(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId)?.meta;
  }

  /** 读取会话缓冲输出（供 UI 跳转回放）。 */
  getOutput(sessionId: string): string {
    return this.sessions.get(sessionId)?.output ?? "";
  }

  /** 用户手动新建交互式登录壳。 */
  createInteractive(options?: {
    cwd?: string;
    cols?: number;
    rows?: number;
    /** 指定 shell；缺省用 Settings 默认。 */
    profileId?: string;
  }): TerminalSession {
    const pty = loadNodePty();
    const general = getGeneralSettings();
    const profile = resolveShellProfile(
      options?.profileId?.trim() || general.shellProfileId,
    );
    const cwd = options?.cwd?.trim() || getActiveWorkspaceRoot() || process.cwd();
    const cols = options?.cols ?? 120;
    const rows = options?.rows ?? 30;
    const sessionId = createId("term");
    const env = {
      ...process.env,
      THINKER_AGENT: "1",
    } as Record<string, string>;

    const proc = pty.spawn(profile.path, profile.args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env,
    });

    const meta: TerminalSession = {
      sessionId,
      title: profile.name,
      cwd,
      cols,
      rows,
      status: "running",
      fromAgent: false,
      profileId: profile.id,
      createdAt: Date.now(),
    };

    this.attach(sessionId, meta, proc);
    broadcast({ type: "created", session: { ...meta } });
    return { ...meta };
  }

  /**
   * Agent shell：开交互式登录壳，写入「命令 + 结束标记」。
   * - 命令真正退出并打出标记 → 一次跑完，关掉会话
   * - block_until 内未见标记（长驻进程 / 超时）→ backgrounded，会话保留
   * 不再用「输出空闲」判结束：server 启动后静默会被误杀。
   */
  async exec(options: ExecOptions): Promise<PtyWaitResult> {
    const general = getGeneralSettings();
    const profile = resolveShellProfile(general.shellProfileId);
    const cwd = options.cwd?.trim() || getActiveWorkspaceRoot() || process.cwd();
    const cols = options.cols ?? 120;
    const rows = options.rows ?? 30;
    const sessionId = createId("term");
    const env = {
      ...process.env,
      THINKER_AGENT: "1",
      TERM: process.env.TERM || "xterm-256color",
      COLORTERM: process.env.COLORTERM || "truecolor",
    } as Record<string, string>;

    const title = options.command.trim().slice(0, 40) || profile.name;

    const meta: TerminalSession = {
      sessionId,
      title,
      cwd,
      cols,
      rows,
      status: "starting",
      command: options.command,
      fromAgent: true,
      profileId: profile.id,
      runId: options.runId,
      threadId: options.threadId,
      createdAt: Date.now(),
    };

    let proc: IPty;
    try {
      const pty = loadNodePty();
      proc = pty.spawn(profile.path, profile.args, {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const output = `$ ${options.command}\r\n\r\n[PTY error] ${message}\r\n`;
      const failed = this.registerFailedSession(meta, output, options);
      this.disposeFinished(failed.sessionId);
      return failed;
    }

    meta.status = "running";
    this.attach(sessionId, meta, proc);
    broadcast({ type: "created", session: { ...meta } });
    options.onSession?.(sessionId);

    await this.waitShellReady(sessionId, 800);

    const wrapped = wrapWithDoneMarker(profile.id, options.command);
    try {
      proc.write(submitLine(profile.id, wrapped));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const note = `\r\n[PTY write error] ${message}\r\n`;
      const cur = this.sessions.get(sessionId);
      if (cur) {
        cur.output = (cur.output + note).slice(-MAX_BUFFER);
        broadcast({ type: "data", sessionId, data: note });
      }
    }

    const blockUntilMs = options.blockUntilMs ?? 30_000;
    // 0：启动后立刻当后台挂起（不等结束标记）
    if (blockUntilMs <= 0) {
      this.markBackgrounded(sessionId);
      const output = stripDoneMarkers(this.sessions.get(sessionId)?.output ?? "");
      return {
        sessionId,
        output,
        exitCode: null,
        backgrounded: true,
      };
    }

    const waited = await this.awaitSession(sessionId, {
      blockUntilMs,
      pattern: donePatternSource(),
      patternMode: "done",
      onData: options.onData,
    });

    const cleaned = stripDoneMarkers(waited.output);
    const doneCode = parseDoneExitCode(waited.output);
    const result: PtyWaitResult = {
      ...waited,
      output: cleaned,
      exitCode: waited.backgrounded ? null : (doneCode ?? waited.exitCode),
    };

    if (result.backgrounded) {
      this.markBackgrounded(sessionId);
    } else {
      this.disposeFinished(sessionId);
    }
    return result;
  }

  /**
   * shell_await 结束：仍挂起则保留；已结束（进程退出等）则关掉会话。
   */
  finishAwait(sessionId: string, result: PtyWaitResult): PtyWaitResult {
    if (result.backgrounded) {
      this.markBackgrounded(sessionId);
    } else {
      this.disposeFinished(sessionId);
    }
    return result;
  }

  /** 标记为后台挂起会话（列表 / 打开终端用）。 */
  private markBackgrounded(sessionId: string): void {
    const rec = this.sessions.get(sessionId);
    if (!rec) return;
    if (rec.meta.backgrounded) return;
    rec.meta = { ...rec.meta, backgrounded: true };
    broadcast({ type: "updated", session: { ...rec.meta } });
  }

  /** 一次跑完或失败：杀掉并移出会话表。 */
  disposeFinished(sessionId: string): void {
    if (!sessionId || !this.sessions.has(sessionId)) return;
    this.kill(sessionId);
  }

  /** 等到壳有输出或超时，再注入 agent 命令。 */
  private waitShellReady(sessionId: string, maxMs: number): Promise<void> {
    const rec = this.sessions.get(sessionId);
    if (!rec) return Promise.resolve();
    if (rec.output.length > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        const cur = this.sessions.get(sessionId);
        if (!cur || cur.output.length > 0 || Date.now() - started >= maxMs) {
          // 略等提示符稳定
          setTimeout(resolve, 60);
          return;
        }
        setTimeout(tick, 25);
      };
      tick();
    });
  }

  awaitSession(
    sessionId: string,
    options: {
      blockUntilMs: number;
      pattern?: string;
      /** 默认 match（shell_await）；exec 用 done。 */
      patternMode?: "done" | "match";
      onData?: (chunk: string) => void;
      requestId?: string;
    },
  ): Promise<PtyWaitResult> {
    const rec = this.sessions.get(sessionId);
    if (!rec) {
      return Promise.reject(new Error(`Unknown terminal session: ${sessionId}`));
    }
    if (rec.meta.status === "exited" || rec.meta.status === "killed") {
      return Promise.resolve({
        sessionId,
        output: rec.output,
        exitCode: rec.meta.exitCode ?? null,
        backgrounded: false,
      });
    }

    const pattern = options.pattern ? new RegExp(options.pattern, "m") : undefined;
    const patternMode = options.patternMode ?? "match";

    return new Promise((resolve) => {
      const requestId = options.requestId ?? createId("ptywait");
      const waiter: SessionRecord["waiters"][number] = {
        requestId,
        resolve,
        startedAt: Date.now(),
        blockUntilMs: Math.max(0, options.blockUntilMs),
        pattern,
        patternMode,
        onData: options.onData,
      };

      if (pattern && pattern.test(rec.output)) {
        resolve(this.resultForPattern(sessionId, rec.output, patternMode));
        return;
      }

      if (waiter.blockUntilMs > 0) {
        waiter.timer = setTimeout(() => {
          this.finishWaiter(sessionId, requestId, {
            sessionId,
            output: rec.output,
            exitCode: null,
            backgrounded: true,
          });
        }, waiter.blockUntilMs);
      }

      rec.waiters.push(waiter);
    });
  }

  /** pattern 命中时的结果：done=可关会话；match=仍挂起。 */
  private resultForPattern(
    sessionId: string,
    output: string,
    mode: "done" | "match",
  ): PtyWaitResult {
    if (mode === "done") {
      return {
        sessionId,
        output,
        exitCode: parseDoneExitCode(output),
        backgrounded: false,
      };
    }
    return {
      sessionId,
      output,
      exitCode: null,
      backgrounded: true,
    };
  }

  write(sessionId: string, data: string): void {
    const rec = this.sessions.get(sessionId);
    if (!rec || !rec.proc || rec.meta.status !== "running") return;
    rec.proc.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const rec = this.sessions.get(sessionId);
    if (!rec?.proc) return;
    const c = Math.max(2, Math.floor(cols));
    const r = Math.max(1, Math.floor(rows));
    try {
      rec.proc.resize(c, r);
    } catch {
      return;
    }
    rec.meta.cols = c;
    rec.meta.rows = r;
    broadcast({ type: "updated", session: { ...rec.meta } });
  }

  kill(sessionId: string): void {
    const rec = this.sessions.get(sessionId);
    if (!rec) return;
    if (rec.proc) {
      try {
        rec.proc.kill();
      } catch {
        /* ignore */
      }
      rec.proc = null;
    }
    rec.meta.status = "killed";
    rec.meta.exitCode = rec.meta.exitCode ?? null;
    this.flushWaiters(sessionId, {
      sessionId,
      output: rec.output,
      exitCode: rec.meta.exitCode ?? null,
      backgrounded: false,
    });
    broadcast({
      type: "exit",
      sessionId,
      exitCode: rec.meta.exitCode ?? null,
      session: { ...rec.meta },
    });
    // 用户关闭后从管理器移除，避免列表 / 重挂载再出现已关会话
    this.sessions.delete(sessionId);
  }

  /** 取消某次 run 关联的全部 agent 终端。 */
  killByRunId(runId: string): void {
    for (const [id, rec] of this.sessions) {
      if (rec.meta.runId === runId && rec.meta.status === "running") {
        this.kill(id);
      }
    }
  }

  /** spawn 失败：登记可回看的幽灵会话并扇出事件。 */
  private registerFailedSession(
    meta: TerminalSession,
    output: string,
    options: ExecOptions,
  ): PtyWaitResult {
    const session: TerminalSession = {
      ...meta,
      status: "exited",
      exitCode: 1,
    };
    const rec: SessionRecord = {
      meta: session,
      proc: null,
      output,
      waiters: [],
    };
    this.sessions.set(session.sessionId, rec);
    broadcast({ type: "created", session: { ...session } });
    options.onSession?.(session.sessionId);
    broadcast({ type: "data", sessionId: session.sessionId, data: output });
    options.onData?.(output);
    broadcast({
      type: "exit",
      sessionId: session.sessionId,
      exitCode: 1,
      session: { ...session },
    });
    return {
      sessionId: session.sessionId,
      output,
      exitCode: 1,
      backgrounded: false,
    };
  }

  private attach(sessionId: string, meta: TerminalSession, proc: IPty): void {
    const rec: SessionRecord = { meta, proc, output: "", waiters: [] };
    this.sessions.set(sessionId, rec);

    proc.onData((data) => {
      rec.output = (rec.output + data).slice(-MAX_BUFFER);
      broadcast({ type: "data", sessionId, data });
      for (const w of [...rec.waiters]) {
        w.onData?.(data);
        if (w.pattern && w.pattern.test(rec.output)) {
          this.finishWaiter(
            sessionId,
            w.requestId,
            this.resultForPattern(sessionId, rec.output, w.patternMode ?? "match"),
          );
        }
      }
    });

    proc.onExit(({ exitCode }) => {
      rec.meta.status = "exited";
      rec.meta.exitCode = exitCode;
      this.flushWaiters(sessionId, {
        sessionId,
        output: rec.output,
        exitCode,
        backgrounded: false,
      });
      broadcast({
        type: "exit",
        sessionId,
        exitCode,
        session: { ...rec.meta },
      });
    });
  }

  private finishWaiter(sessionId: string, requestId: string, result: PtyWaitResult): void {
    const rec = this.sessions.get(sessionId);
    if (!rec) return;
    const idx = rec.waiters.findIndex((w) => w.requestId === requestId);
    if (idx < 0) return;
    const [w] = rec.waiters.splice(idx, 1);
    if (w?.timer) clearTimeout(w.timer);
    w?.resolve(result);
  }

  private flushWaiters(sessionId: string, result: PtyWaitResult): void {
    const rec = this.sessions.get(sessionId);
    if (!rec) return;
    const waiters = rec.waiters.splice(0, rec.waiters.length);
    for (const w of waiters) {
      if (w.timer) clearTimeout(w.timer);
      w.resolve(result);
    }
  }
}

export const terminalSessionManager = new TerminalSessionManager();
