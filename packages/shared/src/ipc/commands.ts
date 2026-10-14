/**
 * Agent 侧 IPC / utility 命令载荷。
 * 由 renderer 或主进程发起，经 utilityProcess 交给 AgentRuntime 执行。
 */

import type { ChatImageRef } from "../protocol/message";

/** 多轮上下文中的一条历史消息（不含当前用户输入）。 */
export type AgentHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  /** 用户轮附图引用（不含像素字节）。 */
  images?: ChatImageRef[];
};

/** 发起一次 agent 运行。 */
export type AgentRunCommand = {
  /**
   * 拥有本轮 run 的聊天会话 id（端到端寻址主键）。
   * Desktop 用其解析 workspace / 落库，禁止仅靠 activeSession 推断所有权。
   */
  sessionId?: string;
  /** 可选；省略时由宿主创建新线程。 */
  threadId?: string;
  /** 用户输入文本。 */
  message: string;
  /** 本轮用户附图引用（不含像素字节）。 */
  images?: ChatImageRef[];
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
  /**
   * 本轮工具执行的工作区绝对路径。
   * 由桌面按 `session.workspaceId` → `workspace.rootPath` 注入；渲染进程传入值在准入时忽略。
   */
  workspaceRoot?: string;
  /** 工作区显示名（别名或文件夹名），写入环境上下文。 */
  workspaceName?: string;
  /**
   * 用户通过 `@` 选中的工作区相对路径（已校验在 workspace 内）。
   * engine 组装上下文时限大小读入并注入 `<context_files>`。
   */
  contextPaths?: string[];
};

/** 取消正在进行的运行（按 runId 或 sessionId 寻址；禁止无目标 cancel-all）。 */
export type AgentCancelCommand = {
  /** 要取消的运行 id；与 sessionId 至少提供一个。 */
  runId?: string;
  /** 会话 id；无 runId 时由主进程账本解析当前 active run。 */
  sessionId?: string;
};

/** 取消单个后台 Task（不停止父 run / 其它 Task）。 */
export type AgentCancelTaskCommand = {
  /** 后台 Task id（与 Task 工具返回的 taskId 一致）。 */
  taskId: string;
  /** 可选；若提供则须与 Map 中 parentRunId 一致。 */
  runId?: string;
};

/** 从 checkpoint 恢复运行（崩溃后续跑）。 */
export type AgentResumeCommand = {
  /** 拥有本轮 resume 的聊天会话 id。 */
  sessionId?: string;
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
