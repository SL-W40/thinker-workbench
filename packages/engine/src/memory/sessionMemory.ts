/**
 * 会话抽取记忆服务。
 *
 * 设计取舍（见方案，针对桌面短板优化）：
 * - 结构化/鲁棒抽取：要求模型产出固定章节 Markdown，解析时校验章节，缺失则回退原文；
 * - 增量更新：把「现存记忆 + 近期摘要」一并给模型产出合并稿，而非整篇盲目重写；
 * - 真实用量驱动阈值：init/update 阈值按上下文窗口比例推导，替代桌面固定 50k/20k；
 * - 熔断：连续失败达上限则暂停深度抽取，避免每次轮后空耗；
 * - 不可变 / fire-and-forget：抽取异步执行，异常被吞，不阻塞图流；
 * - trace：抽取 span 用新增的 TraceRunType "memory"，显式传入 trace 标识以跨异步边界归属。
 */

import { agentEndSpan, agentStartSpan } from "../trace/emit";
import type {
  ChatFn,
  ExtractedInfo,
  MemoryRepository,
  MemoryTraceIds,
  SessionMemoryInput,
  SessionMemoryService,
} from "./repository";
import { estimateMessageTokens } from "./tokenBudget";

/** 固定记忆章节（顺序敏感）。"Session Summary" 是历史会话摘要，不是当前任务。 */
export const MEMORY_SECTIONS = [
  "Session Summary",
  "Key Decisions",
  "Code Changes",
  "Discoveries",
  "Next Steps",
] as const;

/** 历史摘要章节名；呈现时按"历史摘要"剥离。 */
export const SUMMARY_SECTION_NAMES = ["Session Summary"] as const;

/** 新用户消息轮的降级呈现标题与说明（面向模型，英文稳定表述）。 */
const HISTORICAL_NOTES_HEADER = "## Historical Session Notes";
const HISTORICAL_NOTES_NOTE = [
  "The notes below are BACKGROUND from earlier turns of this session.",
  "They are NOT the current task. Always answer the LATEST user message first;",
  "use these notes only when clearly relevant to it.",
].join(" ");

const SYSTEM_INIT = [
  "You are a meticulous project memory keeper.",
  "Read the conversation excerpt and write a concise, durable memory of this session in Markdown.",
  "Use EXACTLY these section headings (## ), in this order; omit a section only if truly empty:",
  MEMORY_SECTIONS.map((s) => `- ${s}`).join("\n"),
  '"Session Summary" describes what happened in PAST turns of this session; it is a historical record, never the current task.',
  "Rules: one bullet per line; no commentary outside sections; preserve exact file paths, function names, and decisions; never invent facts not present in the excerpt.",
].join("\n");

const SYSTEM_UPDATE = [
  "Update the EXISTING session memory to incorporate the new conversation excerpt.",
  "Return the COMPLETE updated memory in the same Markdown section format:",
  MEMORY_SECTIONS.map((s) => `- ${s}`).join("\n"),
  "Merge related items; drop resolved or obsolete points; preserve exact paths and names.",
  '"Session Summary" is a historical record of past turns; keep it up to date but never treat it as the current task.',
  "Do not add a section that is empty.",
].join("\n");

/** 抽取阈值配置。 */
export type SessionMemoryThresholds = {
  /** 无记忆时触发 init 的最小累计输入 token（上限：contextWindow * initRatio）。 */
  initRatio: number;
  /** 有记忆时触发 update 的累计增量 token 下限（上限：contextWindow * updateRatio）。 */
  updateRatio: number;
  /** 触发 update 所需的最少工具调用数（自上次抽取）。 */
  toolCallMin: number;
  /** 参与摘要的近期消息窗口大小。 */
  recentWindow: number;
  /** 连续失败多少次后打开熔断。 */
  maxFailures: number;
};

export const DEFAULT_SESSION_MEMORY_THRESHOLDS: SessionMemoryThresholds = {
  initRatio: 0.12,
  updateRatio: 0.12,
  toolCallMin: 4,
  recentWindow: 24,
  maxFailures: 3,
};

/** 服务依赖。 */
export interface SessionMemoryDeps {
  chat: ChatFn;
  repo: MemoryRepository;
  /** trace 标识（触发时由调用方从 getAgentTraceContext 捕获）。 */
  trace: MemoryTraceIds;
  /** 上下文窗口上限；用于按比例推导阈值，缺省 128K。 */
  contextWindow?: number;
  thresholds?: Partial<SessionMemoryThresholds>;
  onExtracted?: (info: ExtractedInfo) => void;
  onError?: (msg: string) => void;
  onCircuitBroken?: () => void;
}

/** 把消息数组渲染为紧凑摘要文本（近期窗口）。 */
function renderDigest(messages: SessionMemoryInput["messages"], window: number): string {
  const recent = messages.slice(-window);
  const lines: string[] = [];
  for (const m of recent) {
    let body: string;
    if (typeof m.content === "string") {
      body = m.content;
    } else if (Array.isArray(m.content)) {
      body = m.content
        .filter((p) => p.type === "text")
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("");
    } else {
      body = "";
    }
    if (m.tool_calls?.length) {
      const calls = m.tool_calls.map((tc) => tc.function.name).join(", ");
      body = `${body}\n[calls: ${calls}]`.trim();
    }
    const text = body.replace(/\s+/g, " ").trim();
    if (text) lines.push(`<${m.role}>: ${text.slice(0, 800)}`);
  }
  return lines.join("\n");
}

/** 会话记忆呈现：新用户消息轮剥离历史摘要章节并降级为背景注释，其余轮原样返回。 */
export function presentSessionMemory(text: string, opts: { freshUserTurn: boolean }): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (!opts.freshUserTurn) return trimmed;

  // 按标题切块后剔除历史摘要章节（兼容旧 "## Task Overview" 存量标题）
  const headingRe = /^##\s+(.+?)\s*$/gm;
  const matches = [...trimmed.matchAll(headingRe)];
  if (matches.length === 0) return "";
  const kept: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1].trim();
    if (SUMMARY_SECTION_NAMES.some((s) => s.toLowerCase() === name.toLowerCase())) continue;
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? trimmed.length) : trimmed.length;
    kept.push(trimmed.slice(start, end).trim());
  }
  if (kept.length === 0) return "";
  return `${HISTORICAL_NOTES_HEADER}\n\n${HISTORICAL_NOTES_NOTE}\n\n${kept.join("\n\n")}`;
}

/** 解析固定章节；缺失章节则回退为整体文本。 */
function parseSections(raw: string): { text: string; sectionNames: string[] } {
  const stripped = raw.trim();
  const headingRe = /^##\s+(.+?)\s*$/gm;
  const matches = [...stripped.matchAll(headingRe)];
  if (matches.length === 0) {
    return { text: stripped, sectionNames: [] };
  }
  const parts: string[] = [];
  const names: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? stripped.length) : stripped.length;
    const block = stripped.slice(start, end).trim();
    parts.push(block);
    names.push(matches[i][1].trim());
  }
  return { text: parts.join("\n\n"), sectionNames: names };
}

/** 会话抽取记忆服务实现。通常由每个 run 新建一个实例（熔断状态不跨 run 累积）。 */
export class SessionMemoryServiceImpl implements SessionMemoryService {
  private readonly chat: ChatFn;
  private readonly repo: MemoryRepository;
  private readonly trace: MemoryTraceIds;
  private readonly contextWindow: number;
  private readonly thresholds: SessionMemoryThresholds;
  private readonly onExtracted?: (info: ExtractedInfo) => void;
  private readonly onError?: (msg: string) => void;
  private readonly onCircuitBroken?: () => void;

  private everSaved = false;
  private lastExtractInputTokens = 0;
  private currentVersion = 0;
  private inFlight = false;
  private consecutiveFailures = 0;
  private breakerOpen = false;

  constructor(deps: SessionMemoryDeps) {
    this.chat = deps.chat;
    this.repo = deps.repo;
    this.trace = deps.trace;
    this.contextWindow = deps.contextWindow ?? 128_000;
    this.thresholds = { ...DEFAULT_SESSION_MEMORY_THRESHOLDS, ...(deps.thresholds ?? {}) };
    this.onExtracted = deps.onExtracted;
    this.onError = deps.onError;
    this.onCircuitBroken = deps.onCircuitBroken;
  }

  /** 按阈值决定是否抽取；若触发则异步执行（不阻塞调用方）。 */
  maybeExtract(input: SessionMemoryInput): boolean {
    if (this.inFlight || this.breakerOpen) return false;
    const initThreshold = Math.max(
      3_000,
      Math.round(this.contextWindow * this.thresholds.initRatio),
    );
    const updateDelta = Math.max(
      2_000,
      Math.round(this.contextWindow * this.thresholds.updateRatio),
    );
    const ok = this.everSaved
      ? input.cumulativeInputTokens - this.lastExtractInputTokens >= updateDelta &&
        input.toolCallsSinceLastExtract >= this.thresholds.toolCallMin
      : input.cumulativeInputTokens >= initThreshold;
    if (!ok) return false;
    this.inFlight = true;
    void this.runExtraction(input).finally(() => {
      this.inFlight = false;
    });
    return true;
  }

  private async runExtraction(input: SessionMemoryInput): Promise<void> {
    const existing = await this.repo.load(this.trace.sessionId, "session");
    const action: "init" | "update" = existing ? "update" : "init";
    const spanId = this.startSpan(action);
    try {
      const digest = renderDigest(input.messages, this.thresholds.recentWindow);
      const user =
        action === "update"
          ? `Existing memory:\n${existing}\n\nNew excerpt:\n${digest}`
          : `Conversation excerpt:\n${digest}`;
      const raw = await this.chat(action === "update" ? SYSTEM_UPDATE : SYSTEM_INIT, user);
      const { text, sectionNames } = parseSections(raw);
      const version = this.currentVersion + 1;
      await this.repo.save(this.trace.sessionId, "session", text, version);
      this.currentVersion = version;
      this.everSaved = true;
      this.lastExtractInputTokens = input.cumulativeInputTokens;
      this.consecutiveFailures = 0;
      this.breakerOpen = false;
      this.onExtracted?.({
        action,
        sections: sectionNames,
        tokens: estimateMessageTokens(input.messages),
      });
      this.endSpan(spanId, {
        status: "ok",
        // Trace 详情面板摘要：说清这次抽取干了什么
        summary: `会话记忆 v${version} · ${sectionNames.length} 个章节 · ${text.length} 字`,
        attrs: {
          kind: "extract",
          action,
          version,
          sections: sectionNames.join(", "),
          chars: text.length,
        },
        output: text.slice(0, 4_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.onError?.(msg);
      this.endSpan(spanId, { status: "error", summary: "会话记忆抽取失败", error: msg });
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= this.thresholds.maxFailures && !this.breakerOpen) {
        this.breakerOpen = true;
        this.onCircuitBroken?.();
      }
    }
  }

  private startSpan(action: "init" | "update"): string | null {
    try {
      return agentStartSpan({
        name: "memory.extract",
        runType: "memory",
        source: "agent",
        sessionId: this.trace.sessionId,
        traceId: this.trace.traceId,
        agentRunId: this.trace.agentRunId,
        attrs: { kind: "extract", action },
      });
    } catch {
      return null;
    }
  }

  private endSpan(spanId: string | null, patch: Parameters<typeof agentEndSpan>[1]): void {
    if (!spanId) return;
    try {
      agentEndSpan(spanId, patch);
    } catch {
      /* ignore */
    }
  }
}
