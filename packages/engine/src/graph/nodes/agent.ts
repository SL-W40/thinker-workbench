/**
 * agent 节点：一次模型调用。
 *
 * - assembleContext 组装 system / tools / rules / skills
 * - 记忆子系统接入（见 packages/engine/src/memory）：
 *   · 注入静态项目记忆 + 会话抽取记忆为高优先级系统段
 *   · 超出 token 预算时压缩（micro → session → full）并写回 messagesOverride 通道
 *   · 每轮后用 LLM 抽取会话要点，fire-and-forget 落盘（受熔断保护）
 * - 文本增量经 writer 推送 token
 * - 有 tool_calls 则写入 pendingToolCalls，边导向 tools
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { assembleContext } from "../../context/assembleContext";
import { type AutoCompactDeps, AutoCompactor } from "../../memory/compact/autoCompact";
import { createChatFnFromRuntime } from "../../memory/llm";
import {
  DEFAULT_PROJECT_MEMORY_SOURCES,
  defaultProjectMemoryLoader,
} from "../../memory/projectMemory";
import type { MemoryRepository, MemoryTraceIds } from "../../memory/repository";
import { createSqliteMemoryRepository } from "../../memory/repository-sqlite";
import {
  presentSessionMemory,
  type SessionMemoryDeps,
  SessionMemoryServiceImpl,
} from "../../memory/sessionMemory";
import { createContextBudgetFromRuntime } from "../../memory/tokenBudget";
import { chatWithFailover } from "../../model/catalog";
import { getAiLocale, getAllowEmoji, getContextWindow } from "../../model/openai";
import type { ChatMessage } from "../../model/types";
import { getRunContext, getRunTurn, getRunUsage, setRunTurn } from "../../runtime/runContext";
import { getRunEmitter, getRunIds } from "../../runtime/runEmit";
import { getAgentTraceContext } from "../../trace/emit";
import type { AgentGraphState, AgentGraphUpdate } from "../annotation";

const PROJECT_MEMORY_TTL = 30_000;

// --- 跨轮缓存（按 runId / dataDir）---
const repoCache = new Map<string, MemoryRepository>();
const sessionServiceCache = new Map<string, SessionMemoryServiceImpl>();
const autoCompactorCache = new Map<string, AutoCompactor>();
const projectCache = new Map<string, { ts: number; value: string }>();

function countToolMessages(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === "tool").length;
}

async function getOrCreateRepo(dataDir?: string): Promise<MemoryRepository> {
  const key = dataDir ?? "__none__";
  const cached = repoCache.get(key);
  if (cached) return cached;
  const repo = await createSqliteMemoryRepository(dataDir);
  repoCache.set(key, repo);
  return repo;
}

function getOrCreateSessionService(
  runId: string,
  deps: SessionMemoryDeps,
): SessionMemoryServiceImpl {
  const cached = sessionServiceCache.get(runId);
  if (cached) return cached;
  const svc = new SessionMemoryServiceImpl(deps);
  sessionServiceCache.set(runId, svc);
  return svc;
}

function getOrCreateAutoCompactor(runId: string, deps: AutoCompactDeps): AutoCompactor {
  const cached = autoCompactorCache.get(runId);
  if (cached) return cached;
  const ac = new AutoCompactor(deps);
  autoCompactorCache.set(runId, ac);
  return ac;
}

async function loadProjectMemory(workspaceRoot: string): Promise<string> {
  const now = Date.now();
  const hit = projectCache.get(workspaceRoot);
  if (hit && now - hit.ts < PROJECT_MEMORY_TTL) return hit.value;
  const value = await defaultProjectMemoryLoader.load(
    workspaceRoot,
    DEFAULT_PROJECT_MEMORY_SOURCES,
  );
  projectCache.set(workspaceRoot, { ts: now, value });
  return value;
}

/** 一轮模型回合：可能流式文本，也可能请求工具。 */
export async function agent(
  state: AgentGraphState,
  config: LangGraphRunnableConfig,
): Promise<AgentGraphUpdate> {
  const signal = config.signal ?? AbortSignal.timeout(3_600_000);
  const emit = getRunEmitter();
  if (!emit) {
    throw new Error("agent requires an active run emitter for streaming tokens.");
  }

  // 轮次仅作观测（Trace attrs.turn）；执行步数预算由 LangGraph recursionLimit 承载
  const turn = (getRunTurn() ?? 0) + 1;

  const ctx = getRunContext();
  const runIds = getRunIds();
  const tc = getAgentTraceContext();
  const sessionId = ctx?.sessionId ?? runIds?.sessionId ?? "";
  const trace: MemoryTraceIds = {
    sessionId,
    traceId: tc?.traceId,
    agentRunId: tc?.runId ?? runIds?.runId,
  };
  const chatFn = createChatFnFromRuntime();

  // 1) 加载记忆；新用户消息首轮剥离历史任务摘要（话题切换防护，防答非所问）
  const repo = await getOrCreateRepo(ctx?.dataDir);
  const sessionMemoryRaw = sessionId ? await repo.load(sessionId, "session") : null;
  const sessionMemoryText = sessionMemoryRaw
    ? presentSessionMemory(sessionMemoryRaw, {
        freshUserTurn: ctx?.freshUserTurn ?? false,
      })
    : null;
  const projectMemoryText = await loadProjectMemory(ctx?.workspaceRoot ?? process.cwd());

  // 2) 决定喂给模型的消息数组（压缩副本优先）
  const override = state.messagesOverride;
  let usingOverride = (override?.length ?? 0) > 0;
  let modelMessages: ChatMessage[] = usingOverride && override ? override : (state.messages ?? []);

  // 3) 超预算则压缩（micro 永远执行；有 chat 时再 session/full），并写回 messagesOverride
  const budget = createContextBudgetFromRuntime();
  if (budget.shouldCompact(modelMessages)) {
    const auto = getOrCreateAutoCompactor(runIds?.runId ?? "default", {
      chat: chatFn ?? undefined,
      trace,
      onCompact: (info) =>
        emit({
          type: "memory",
          phase: "compacted",
          layer: info.layer,
          before: info.before,
          after: info.after,
          truncated: info.truncated,
        }),
      onCircuitBroken: () => emit({ type: "memory", phase: "circuit_broken" }),
    });
    const res = await auto.maybeCompact(modelMessages, budget);
    if (res && res.after < modelMessages.length) {
      modelMessages = res.messages;
      usingOverride = true;
    }
  }

  const context = assembleContext({
    messages: modelMessages,
    aiLocale: getAiLocale(),
    allowEmoji: getAllowEmoji(),
    contextWindow: getContextWindow(),
    contextPaths: state.contextPaths,
    projectMemory: projectMemoryText || undefined,
    sessionMemory: sessionMemoryText || undefined,
  });

  // 尚无 reasoning 正文时用 planning；有 thinking token 后再由 UI 升为 Thinking
  emit({ type: "status", status: "planning" });
  setRunTurn(turn);

  const result = await chatWithFailover(
    {
      messages: context.messages,
      tools: context.tools,
      system: context.system,
      systemSections: context.systemSections,
      onToken: (text, channel) => {
        emit({ type: "token", text, channel: channel ?? "reply" });
      },
    },
    signal,
  );

  // 用量已在唯一卡口 `chatWithFailover` 入账；这里仅转发出去供 UI 直播
  if (result.usage) emit({ type: "usage", usage: result.usage });

  const assistant: ChatMessage = {
    role: "assistant",
    content: result.content || null,
    ...(result.toolCalls.length > 0 ? { tool_calls: result.toolCalls } : {}),
  };

  // 4) 轮后 fire-and-forget 抽取会话记忆
  if (repo && sessionId && chatFn) {
    const svc = getOrCreateSessionService(runIds?.runId ?? "default", {
      chat: chatFn,
      repo,
      trace,
      contextWindow: getContextWindow() ?? 128_000,
      onExtracted: (info) =>
        emit({
          type: "memory",
          phase: "extracted",
          memoryKind: "session",
          action: info.action,
          sections: info.sections,
        }),
      onCircuitBroken: () => emit({ type: "memory", phase: "circuit_broken" }),
    });
    const usage = getRunUsage();
    svc.maybeExtract({
      messages: [...modelMessages, assistant],
      cumulativeInputTokens: usage?.usage.inputTokens ?? 0,
      toolCallsSinceLastExtract: countToolMessages(modelMessages),
      trace,
    });
  }

  const reply = result.content
    ? state.reply
      ? `${state.reply}\n\n${result.content}`
      : result.content
    : state.reply;

  const nextOverride = usingOverride ? [...modelMessages, assistant] : undefined;

  return {
    messages: [assistant],
    pendingToolCalls: result.toolCalls,
    reply,
    messagesOverride: nextOverride,
  };
}
