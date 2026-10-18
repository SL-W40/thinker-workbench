/**
 * 记忆子系统公共契约与类型。
 *
 * 设计原则（见方案）：
 * - 只依赖引擎内部 OpenAI 风格消息（`../model/types` 的 ChatMessage）；
 *   绝不 import shared 的 UI ChatMessage。
 * - 持久化与 LLM 都经接口抽象（MemoryRepository / ChatFn），
 *   便于单测用假对象替换，也避免 engine 直接依赖 better-sqlite3。
 */

import type { ChatMessage } from "../model/types";

/** 记忆种类：项目级（规则/知识）与会话级（抽取要点）。 */
export type MemoryKind = "project" | "session";

/**
 * 记忆仓库抽象。引擎只认接口；SQLite 实现位于 desktop 层
 * （packages/desktop/src/db/thinkerDb.ts，针对每工作区 chat.db 的 session_memory 表）。
 */
export interface MemoryRepository {
  /** 读取某会话某类记忆；不存在返回 null。 */
  load(sessionId: string, kind: MemoryKind): Promise<string | null>;
  /** 写入（覆盖）某会话某类记忆；version 用于乐观并发，单调递增。 */
  save(sessionId: string, kind: MemoryKind, content: string, version: number): Promise<void>;
}

/**
 * 无工具补全抽象：包裹主模型的一次 system+user 补全，返回文本。
 * 抽取/摘要统一走它，测试时可注入假实现。
 */
export type ChatFn = (system: string, user: string) => Promise<string>;

/** 记忆操作的 trace 标识；触发时显式捕获，供 agentStartSpan 传参（应对全局 ctx 切换）。 */
export interface MemoryTraceIds {
  sessionId: string;
  traceId?: string;
  agentRunId?: string;
}

/** 一次抽取/更新完成后的可见性信息（供 trace span attrs + run 事件）。 */
export interface ExtractedInfo {
  action: "init" | "update";
  sections: string[];
  tokens: number;
}

/** 一次压缩完成后的可见性信息。 */
export interface CompactInfo {
  layer: "micro" | "session" | "full";
  before: number;
  after: number;
  truncated: number;
}

/** token 预算等级。 */
export type BudgetLevel = "ok" | "warning" | "auto" | "blocking";

/**
 * 上下文 token 预算契约。实现见 tokenBudget.ts。
 * 真实用量来自 usageLedger（getRunUsage），缺失时回退估算。
 */
export interface ContextBudget {
  /** 模型上下文窗口上限（token）。 */
  readonly contextWindow: number;
  /** 当前已消耗输入 token（来自 usageLedger 真实用量或回退估算）。 */
  readonly usedInputTokens: number;
  /** 预留给模型输出的 token。 */
  readonly reserveOutputTokens: number;
  /** 估算给定消息数组的 token 数（内容/工具调用均计）。 */
  estimateTokens(messages: ChatMessage[]): number;
  /** 占用比例 = (usedInputTokens + estimate(messages) + reserve) / contextWindow。 */
  ratio(messages: ChatMessage[]): number;
  /** 当前占用等级。 */
  level(messages: ChatMessage[]): BudgetLevel;
  /** 是否应触发自动压缩。 */
  shouldCompact(messages: ChatMessage[]): boolean;
}

/** 每轮后传给 SessionMemoryService 的输入。 */
export interface SessionMemoryInput {
  /** 本轮后的全部对话消息（引擎内部 OpenAI 风格）。 */
  messages: ChatMessage[];
  /** 累计输入 token（来自 usageLedger）。 */
  cumulativeInputTokens: number;
  /** 上次抽取以来的工具调用次数。 */
  toolCallsSinceLastExtract: number;
  /** trace 标识，触发时由调用方捕获。 */
  trace: MemoryTraceIds;
}

/**
 * 会话抽取记忆服务契约。实现见 sessionMemory.ts。
 * 抽取按阈值触发，且 fire-and-forget（调用方不 await 长任务）。
 */
export interface SessionMemoryService {
  /** 按阈值决定是否抽取；若需抽取则异步执行（内部 catch + 熔断）。返回是否触发了抽取。 */
  maybeExtract(input: SessionMemoryInput): boolean;
}

/** 项目记忆来源（可配置，替代桌面硬编码 THINKER.md/CLAUDE.md）。 */
export interface ProjectMemorySource {
  /** 相对 workspaceRoot 的目录或通配（glob）；目录默认递归。 */
  pattern: string;
  /** 该来源字符预算上限；超出截断。 */
  maxChars?: number;
  /** 是否递归目录。 */
  recursive?: boolean;
}

/** 项目记忆加载器契约。实现见 projectMemory.ts。 */
export interface ProjectMemoryLoader {
  load(workspaceRoot: string, sources: ProjectMemorySource[]): Promise<string>;
}
