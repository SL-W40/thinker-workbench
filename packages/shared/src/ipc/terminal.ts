/**
 * 终端会话与 shell profile 契约（renderer ↔ main；PTY 仅在 desktop main）。
 */

/** 本机可探测到的 shell 配置（Settings 选择用）。 */
export type ShellProfile = {
  id: string;
  /** 展示名（可再经 i18n）。 */
  name: string;
  path: string;
  args: string[];
};

/** 终端会话生命周期状态。 */
export type TerminalSessionStatus = "starting" | "running" | "exited" | "killed";

/** 一条 PTY 会话的元数据。 */
export type TerminalSession = {
  sessionId: string;
  /** 列表展示名（profile 名或 command 短名）。 */
  title: string;
  cwd: string;
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  /** 若由 agent shell 工具创建，为原始命令。 */
  command?: string;
  exitCode?: number | null;
  runId?: string;
  threadId?: string;
  /** 是否由 agent 发起（UI 徽章）。 */
  fromAgent?: boolean;
  /** agent 超时挂起、仍可交互 / shell_await。 */
  backgrounded?: boolean;
  /** 使用的 shell profile id。 */
  profileId?: string;
  createdAt: number;
};

/** 推送给 renderer 的终端事件。 */
export type TerminalEvent =
  | { type: "created"; session: TerminalSession }
  | { type: "data"; sessionId: string; data: string }
  | {
      type: "exit";
      sessionId: string;
      exitCode: number | null;
      session: TerminalSession;
    }
  | { type: "updated"; session: TerminalSession };

/** Preload 暴露的终端 API。 */
export type ThinkerTerminalApi = {
  listSessions(): Promise<TerminalSession[]>;
  listShellProfiles(): Promise<ShellProfile[]>;
  /** 用户手动新建交互式会话（登录壳，无单条 command）。 */
  create(options?: {
    cwd?: string;
    cols?: number;
    rows?: number;
    /** 指定 shell profile；缺省用 Settings 默认。 */
    profileId?: string;
  }): Promise<TerminalSession>;
  write(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  kill(sessionId: string): Promise<void>;
  /** 读取主进程侧已缓冲的会话输出（切换 / 跳转时回放）。 */
  getOutput(sessionId: string): Promise<string>;
  onEvent(cb: (event: TerminalEvent) => void): () => void;
};
