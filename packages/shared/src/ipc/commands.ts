/**
 * Agent 侧 IPC / utility 命令载荷。
 * 由 renderer 或主进程发起，经 utilityProcess 交给 AgentRuntime 执行。
 */

/** 多轮上下文中的一条历史消息（不含当前用户输入）。 */
export type AgentHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/** 发起一次 agent 运行。 */
export type AgentRunCommand = {
  /** 可选；省略时由宿主创建新线程。 */
  threadId?: string;
  /** 用户输入文本。 */
  message: string;
  /**
   * 本轮之前的对话历史（user / assistant 正文），不含当前 `message`。
   * 用于多轮记忆；省略则模型只看到本轮用户话。
   */
  history?: AgentHistoryMessage[];
  /**
   * 端到端追踪 id（由 renderer 创建并沿 IPC / utility 下传）。
   * 省略时由 desktop 或 agent 补生成。
   */
  traceId?: string;
  /** 本轮工具执行的工作区绝对路径（由桌面注入 active workspace）。 */
  workspaceRoot?: string;
  /** 工作区显示名（别名或文件夹名），写入环境上下文。 */
  workspaceName?: string;
};

/** 取消正在进行的运行。 */
export type AgentCancelCommand = {
  /** 要取消的运行 id。 */
  runId: string;
};

/** 从 checkpoint 恢复运行（崩溃后续跑）。 */
export type AgentResumeCommand = {
  /** 所属线程 id。 */
  threadId: string;
  /**
   * 端到端追踪 id（由 renderer 创建并沿 IPC / utility 下传）。
   * 省略时由 desktop 或 agent 补生成。
   */
  traceId?: string;
  /** 工作区显示名（写入环境上下文）。 */
  workspaceName?: string;
};
