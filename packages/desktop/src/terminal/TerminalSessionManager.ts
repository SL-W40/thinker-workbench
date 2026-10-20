/**
 * 主进程 PTY / direct 会话管理：AgentShellRun 状态机 + 增量输出 + spill。
 * 完成永远是会话上的 finalize；block_until_ms 只决定本次 waiter 等多久。
 */
import { createId, type TerminalSession } from "@thinker-workbench/shared";
import type { IPty } from "node-pty";
import { getGeneralSettings } from "../config/settingsStore";
import { getActiveWorkspaceRoot } from "../db/workspacesStore";
import { createDataBroadcastBatcher } from "./dataBroadcastBatcher";
import { resolveShellProfile } from "./detectShellProfiles";
import { buildDirectExecArgs } from "./directExecArgs";
import { loadNodePty } from "./loadNodePty";
import { appendOutputWithSpill } from "./outputSpill";
import { completeResult, createRun, stillRunningResult } from "./sessionRun";
import { buildPtyEnv } from "./shellEnv";
import {
  hasDoneMarker,
  looksLikeCommandSettled,
  parseDoneExitCode,
  stripDoneMarkers,
  submitLine,
  wrapWithDoneMarker,
} from "./shellMarkers";
import { broadcast } from "./terminalEvents";
import type {
  AgentShellRun,
  ExecOptions,
  PtyWaitResult,
  SessionRecord,
  SessionWaiter,
  ShellExecMode,
  ShellOutcome,
  ShellWakeReason,
  StartAgentCommandOptions,
  WaitAgentCommandOptions,
} from "./terminalSessionTypes";

export type {
  ExecOptions,
  PtyWaitResult,
  ShellExecMode,
  ShellOutcome,
  ShellWakeReason,
  StartAgentCommandOptions,
  WaitAgentCommandOptions,
};

class TerminalSessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  /** finalize 后短时缓存，供迟到的 shell_await 命中 complete。 */
  private readonly finalResults = new Map<string, PtyWaitResult>();
  /** UI 侧 data 广播合并；waiter / AgentBridge 仍收原始 chunk。 */
  private readonly dataBatcher = createDataBroadcastBatcher((sessionId, data) => {
    broadcast({ type: "data", sessionId, data });
  });

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
    profileId?: string;
  }): TerminalSession {
    const pty = loadNodePty();
    const general = getGeneralSettings();
    const profile = resolveShellProfile(options?.profileId?.trim() || general.shellProfileId);
    const cwd = options?.cwd?.trim() || getActiveWorkspaceRoot() || process.cwd();
    const cols = options?.cols ?? 120;
    const rows = options?.rows ?? 30;
    const sessionId = createId("term");
    const env = buildPtyEnv({ THINKER_AGENT: "1" });

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

    this.attach(sessionId, meta, proc, null);
    broadcast({ type: "created", session: { ...meta } });
    return { ...meta };
  }

  /**
   * 启动 Agent 命令（不阻塞）。login = 登录壳 + OSC；direct = 非交互子进程。
   */
  async startAgentCommand(options: StartAgentCommandOptions): Promise<{ sessionId: string }> {
    const execMode: ShellExecMode = options.execMode ?? "login";
    if (execMode === "direct") {
      return this.startDirect(options);
    }
    return this.startLogin(options);
  }

  /**
   * 订阅会话 settled：已 finalize 立即 complete；否则限时等待。
   * 超时只结束本次调用，不 finalize、不弃跟踪。
   */
  waitAgentCommand(sessionId: string, options: WaitAgentCommandOptions): Promise<PtyWaitResult> {
    const rec = this.sessions.get(sessionId);
    if (!rec) {
      const cached = this.finalResults.get(sessionId);
      if (cached) {
        this.finalResults.delete(sessionId);
        return Promise.resolve({ ...cached, wakeReason: cached.wakeReason ?? "exit" });
      }
      return Promise.reject(new Error(`Unknown terminal session: ${sessionId}`));
    }

    if (rec.run?.finalized || rec.meta.status === "exited" || rec.meta.status === "killed") {
      return Promise.resolve(this.completeResult(rec, "exit"));
    }

    const pattern = options.pattern ? new RegExp(options.pattern, "m") : undefined;
    if (pattern?.test(rec.output)) {
      this.markBackgrounded(sessionId, "pattern");
      return Promise.resolve(this.stillRunningResult(rec, "pattern"));
    }

    const budgetMs = Math.max(0, options.budgetMs);
    if (budgetMs <= 0) {
      this.markBackgrounded(sessionId, "background");
      return Promise.resolve(this.stillRunningResult(rec, "background"));
    }

    return new Promise((resolve) => {
      const requestId = options.requestId ?? createId("ptywait");
      const waiter: SessionWaiter = {
        requestId,
        resolve,
        startedAt: Date.now(),
        budgetMs,
        pattern,
        onData: options.onData,
      };

      waiter.timer = setTimeout(() => {
        this.finishWaiter(sessionId, requestId, () => {
          this.markBackgrounded(sessionId, "timeout");
          return this.stillRunningResult(rec, "timeout");
        });
      }, budgetMs);

      rec.waiters.push(waiter);

      // 注册后若已 finalize（竞态），立刻收束
      if (rec.run?.finalized) {
        this.finishWaiter(sessionId, requestId, () => this.completeResult(rec, "exit"));
      }
    });
  }

  /**
   * 兼容旧 exec：start + wait。
   * blockUntilMs<=0 视为立刻 still_running（wakeReason=background）。
   */
  async exec(options: ExecOptions): Promise<PtyWaitResult> {
    const { sessionId } = await this.startAgentCommand(options);
    const budgetMs = options.blockUntilMs ?? 30_000;
    const waited = await this.waitAgentCommand(sessionId, {
      budgetMs,
      onData: options.onData,
    });
    if (waited.outcome === "complete") {
      this.disposeFinished(sessionId);
    }
    return waited;
  }

  /**
   * shell_await 结束：仍 running 则保留；complete 则关掉会话。
   */
  finishAwait(sessionId: string, result: PtyWaitResult): PtyWaitResult {
    if (result.outcome === "complete") {
      this.disposeFinished(sessionId);
    } else {
      this.markBackgrounded(sessionId, result.wakeReason ?? "timeout");
    }
    return result;
  }

  /** 兼容旧名 → waitAgentCommand。 */
  awaitSession(
    sessionId: string,
    options: {
      blockUntilMs: number;
      pattern?: string;
      patternMode?: "done" | "match";
      onData?: (chunk: string) => void;
      requestId?: string;
    },
  ): Promise<PtyWaitResult> {
    return this.waitAgentCommand(sessionId, {
      budgetMs: options.blockUntilMs,
      pattern: options.pattern,
      onData: options.onData,
      requestId: options.requestId,
    });
  }

  write(sessionId: string, data: string): void {
    const rec = this.sessions.get(sessionId);
    if (!rec?.proc || rec.meta.status !== "running") {
      throw new Error(`Session not writable: ${sessionId}`);
    }
    // direct 无持久交互壳
    if (rec.run?.execMode === "direct") {
      throw new Error("shell_write is not supported for direct exec sessions.");
    }
    rec.proc.write(data);
    // Ctrl+C：若 OSC finally 未打出，短延迟后按提示符/中断文案兜底 finalize
    if (data.includes("\x03")) {
      this.armInterruptFinalize(sessionId);
    }
  }

  /**
   * 中断后兜底：login 壳若已回到提示符却无 done 标记，仍 finalize，清掉 Background 条。
   */
  private armInterruptFinalize(sessionId: string): void {
    const delays = [800, 2000, 4000];
    for (const ms of delays) {
      setTimeout(() => {
        const cur = this.sessions.get(sessionId);
        if (!cur?.run || cur.run.finalized) return;
        if (hasDoneMarker(cur.output)) return;
        const tail = cur.output.slice(-800);
        if (looksLikeCommandSettled(tail)) {
          this.finalize(sessionId, 130);
        }
      }, ms);
    }
  }

  /** 是否允许对会话写入（login + running + fromAgent）。 */
  canWrite(sessionId: string): boolean {
    const rec = this.sessions.get(sessionId);
    if (!rec?.proc || rec.meta.status !== "running" || !rec.meta.fromAgent) {
      return false;
    }
    return rec.run?.execMode !== "direct";
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
    // 先刷出未发 UI 数据，再发 exit，避免尾包丢在时间窗里
    this.dataBatcher.flush(sessionId);
    if (rec.proc) {
      try {
        rec.proc.kill();
      } catch {
        /* ignore */
      }
      rec.proc = null;
    }
    if (rec.run && !rec.run.finalized) {
      rec.run.finalized = true;
      rec.run.status = "exited";
      rec.run.exitCode = rec.meta.exitCode ?? null;
      rec.run.resolveSettled();
      const snapshot = this.completeResult(rec, "exit");
      this.finalResults.set(sessionId, snapshot);
      this.flushWaiters(sessionId, () => ({ ...snapshot, output: "" }));
      broadcast({
        type: "commandExited",
        sessionId,
        exitCode: snapshot.exitCode,
        session: { ...rec.meta, status: "killed", exitCode: snapshot.exitCode },
      });
    } else {
      this.flushWaiters(sessionId, () => this.completeResult(rec, "exit"));
    }
    rec.meta.status = "killed";
    rec.meta.exitCode = rec.meta.exitCode ?? null;
    broadcast({
      type: "exit",
      sessionId,
      exitCode: rec.meta.exitCode ?? null,
      session: { ...rec.meta },
    });
    // 保留 spill 文件供后续 read_file；仅断开 run 引用
    if (rec.run) {
      rec.run.outputFilePath = null;
      rec.run.outputReportPath = null;
      rec.run.spilled = false;
    }
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

  /** 一次跑完或失败：杀掉并移出会话表。 */
  disposeFinished(sessionId: string): void {
    if (!sessionId || !this.sessions.has(sessionId)) return;
    this.kill(sessionId);
  }

  /**
   * 退出前杀掉全部 PTY。
   * 新 macOS + Electron 上残留 node-pty 易在进程退出时 SIGABRT。
   */
  disposeAll(): void {
    const ids = [...this.sessions.keys()];
    for (const id of ids) {
      try {
        this.kill(id);
      } catch {
        /* 退出路径忽略单会话失败 */
      }
    }
    this.dataBatcher.dispose();
  }

  // ─── 内部：启动 ───────────────────────────────────────────

  private async startLogin(options: StartAgentCommandOptions): Promise<{ sessionId: string }> {
    const general = getGeneralSettings();
    const profile = resolveShellProfile(general.shellProfileId);
    const cwd = options.cwd?.trim() || getActiveWorkspaceRoot() || process.cwd();
    const cols = options.cols ?? 120;
    const rows = options.rows ?? 30;
    const sessionId = createId("term");
    const env = buildPtyEnv({
      THINKER_AGENT: "1",
      TERM: process.env.TERM || "xterm-256color",
      COLORTERM: process.env.COLORTERM || "truecolor",
    });

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
      this.registerFailedSession(meta, output, options);
      return { sessionId };
    }

    meta.status = "running";
    const run = this.createRun("login");
    this.attach(sessionId, meta, proc, run);
    broadcast({ type: "created", session: { ...meta } });
    options.onSession?.(sessionId);

    await this.waitShellReady(sessionId, 800);

    const wrapped = wrapWithDoneMarker(profile, options.command);
    try {
      proc.write(submitLine(profile, wrapped));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const note = `\r\n[PTY write error] ${message}\r\n`;
      this.appendOutputWithSpill(sessionId, note);
    }

    return { sessionId };
  }

  private async startDirect(options: StartAgentCommandOptions): Promise<{ sessionId: string }> {
    const general = getGeneralSettings();
    const profile = resolveShellProfile(general.shellProfileId);
    const cwd = options.cwd?.trim() || getActiveWorkspaceRoot() || process.cwd();
    const cols = options.cols ?? 120;
    const rows = options.rows ?? 30;
    const sessionId = createId("term");
    const env = buildPtyEnv({
      THINKER_AGENT: "1",
      TERM: process.env.TERM || "xterm-256color",
      COLORTERM: process.env.COLORTERM || "truecolor",
    });

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

    const inv = buildDirectExecArgs(profile, options.command);
    let proc: IPty;
    try {
      const pty = loadNodePty();
      proc = pty.spawn(inv.file, inv.args, {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const output = `$ ${options.command}\r\n\r\n[PTY error] ${message}\r\n`;
      this.registerFailedSession(meta, output, options);
      return { sessionId };
    }

    meta.status = "running";
    const run = this.createRun("direct");
    this.attach(sessionId, meta, proc, run);
    broadcast({ type: "created", session: { ...meta } });
    options.onSession?.(sessionId);
    return { sessionId };
  }

  private createRun(execMode: ShellExecMode): AgentShellRun {
    return createRun(execMode);
  }

  // ─── 内部：finalize / 输出 ─────────────────────────────────

  /**
   * 唯一终态出口（login：OSC / PTY exit；direct：子进程 exit）。
   * 幂等：只生效一次。不在此 dispose——由 exec / finishAwait / 延迟回收负责。
   */
  private finalize(sessionId: string, exitCode: number | null): void {
    const rec = this.sessions.get(sessionId);
    if (!rec?.run || rec.run.finalized) return;

    // 终态事件前刷出合并中的 data，保证 UI 先看到完整输出再收到 exit
    this.dataBatcher.flush(sessionId);

    rec.run.finalized = true;
    rec.run.status = "exited";
    rec.run.exitCode = exitCode;
    rec.meta.status = "exited";
    rec.meta.exitCode = exitCode;
    rec.meta.backgrounded = false;
    rec.run.resolveSettled();

    const snapshot = this.completeResult(rec, "exit");
    const hadWaiters = rec.waiters.length > 0;
    this.flushWaiters(sessionId, () => snapshot);
    // 无 waiter 时把增量留给迟到的 shell_await；有 waiter 则只缓存终态元数据
    this.finalResults.set(sessionId, hadWaiters ? { ...snapshot, output: "" } : snapshot);

    broadcast({
      type: "commandExited",
      sessionId,
      exitCode,
      session: { ...rec.meta },
    });
    broadcast({
      type: "exit",
      sessionId,
      exitCode,
      session: { ...rec.meta },
    });
    broadcast({ type: "updated", session: { ...rec.meta } });

    // 无活动 waiter 时延迟回收 PTY（仍可通过 finalResults 被 await）
    setTimeout(() => {
      if (!this.sessions.has(sessionId)) return;
      const cur = this.sessions.get(sessionId);
      if (cur?.run?.finalized && cur.waiters.length === 0) {
        this.disposeFinished(sessionId);
      }
    }, 30_000);
  }

  private markBackgrounded(sessionId: string, reason: ShellWakeReason = "timeout"): void {
    const rec = this.sessions.get(sessionId);
    if (!rec) return;
    if (rec.run?.finalized) return;
    const first = !rec.meta.backgrounded;
    if (first) {
      rec.meta = { ...rec.meta, backgrounded: true };
      broadcast({ type: "updated", session: { ...rec.meta } });
      broadcast({
        type: "commandBackgrounded",
        sessionId,
        reason,
        session: { ...rec.meta },
      });
    }
  }

  /** 追加输出；超阈值落盘并截断内存尾部。 */
  private appendOutputWithSpill(sessionId: string, data: string): void {
    const rec = this.sessions.get(sessionId);
    if (!rec) return;
    appendOutputWithSpill(rec, data, (sid, chunk) => this.dataBatcher.enqueue(sid, chunk));
  }

  private completeResult(rec: SessionRecord, wakeReason: ShellWakeReason): PtyWaitResult {
    return completeResult(rec, wakeReason);
  }

  private stillRunningResult(rec: SessionRecord, wakeReason: ShellWakeReason): PtyWaitResult {
    return stillRunningResult(rec, wakeReason);
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
          setTimeout(resolve, 60);
          return;
        }
        setTimeout(tick, 25);
      };
      tick();
    });
  }

  private registerFailedSession(
    meta: TerminalSession,
    output: string,
    options: StartAgentCommandOptions,
  ): void {
    const session: TerminalSession = {
      ...meta,
      status: "exited",
      exitCode: 1,
    };
    const run = this.createRun(options.execMode ?? "login");
    run.finalized = true;
    run.status = "exited";
    run.exitCode = 1;
    run.resolveSettled();
    const rec: SessionRecord = {
      meta: session,
      proc: null,
      output,
      waiters: [],
      run,
    };
    this.sessions.set(session.sessionId, rec);
    broadcast({ type: "created", session: { ...session } });
    options.onSession?.(session.sessionId);
    broadcast({ type: "data", sessionId: session.sessionId, data: output });
    options.onData?.(output);
    broadcast({
      type: "commandExited",
      sessionId: session.sessionId,
      exitCode: 1,
      session: { ...session },
    });
    broadcast({
      type: "exit",
      sessionId: session.sessionId,
      exitCode: 1,
      session: { ...session },
    });
  }

  private attach(
    sessionId: string,
    meta: TerminalSession,
    proc: IPty,
    run: AgentShellRun | null,
  ): void {
    const rec: SessionRecord = { meta, proc, output: "", waiters: [], run };
    this.sessions.set(sessionId, rec);

    proc.onData((data) => {
      this.appendOutputWithSpill(sessionId, data);
      const cur = this.sessions.get(sessionId);
      if (!cur) return;

      for (const w of [...cur.waiters]) {
        w.onData?.(data);
      }

      // 先 finalize，避免同 chunk 内 pattern 误报 still_running
      if (cur.run && !cur.run.finalized && cur.run.execMode === "login") {
        if (hasDoneMarker(cur.output)) {
          const code = parseDoneExitCode(cur.output);
          this.finalize(sessionId, code);
          return;
        }
      }

      for (const w of [...cur.waiters]) {
        if (w.pattern?.test(cur.output)) {
          this.finishWaiter(sessionId, w.requestId, () => {
            this.markBackgrounded(sessionId, "pattern");
            return this.stillRunningResult(cur, "pattern");
          });
        }
      }
    });

    proc.onExit(({ exitCode }) => {
      const cur = this.sessions.get(sessionId);
      if (!cur) return;
      if (cur.run && !cur.run.finalized) {
        // direct：子进程 exit 即完成；login：PTY 退出兜底
        this.finalize(sessionId, exitCode);
      } else if (!cur.run) {
        this.dataBatcher.flush(sessionId);
        cur.meta.status = "exited";
        cur.meta.exitCode = exitCode;
        this.flushWaiters(sessionId, () => ({
          sessionId,
          output: stripDoneMarkers(cur.output),
          exitCode,
          backgrounded: false,
          outcome: "complete" as const,
          wakeReason: "exit" as const,
        }));
        broadcast({
          type: "exit",
          sessionId,
          exitCode,
          session: { ...cur.meta },
        });
      }
    });
  }

  private finishWaiter(sessionId: string, requestId: string, build: () => PtyWaitResult): void {
    const rec = this.sessions.get(sessionId);
    if (!rec) return;
    const idx = rec.waiters.findIndex((w) => w.requestId === requestId);
    if (idx < 0) return;
    const [w] = rec.waiters.splice(idx, 1);
    if (w?.timer) clearTimeout(w.timer);
    w?.resolve(build());
  }

  private flushWaiters(sessionId: string, build: () => PtyWaitResult): void {
    const rec = this.sessions.get(sessionId);
    if (!rec) return;
    const waiters = rec.waiters.splice(0, rec.waiters.length);
    // 同一结果快照：outputCursor 只推进一次
    const result = build();
    for (const w of waiters) {
      if (w.timer) clearTimeout(w.timer);
      // 后续 waiter 拿到空增量
      w.resolve({
        ...result,
        output: w === waiters[0] ? result.output : "",
      });
    }
  }
}

export const terminalSessionManager = new TerminalSessionManager();
