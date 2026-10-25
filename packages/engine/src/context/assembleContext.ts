/**
 * 统一组装发模型上下文：system / tools / rules / skills / conversation。
 * agent 请求与 Context Usage 估算共用本出口。
 */
import {
  type AiLocale,
  type ChatAttachmentRef,
  type ChatMode,
  type ContextUsageSegment,
  type ContextUsageSnapshot,
  DEFAULT_CONTEXT_WINDOW,
} from "@thinker-workbench/shared";
import { buildChatModeAddendum, getChatMode } from "../chatMode";
import { getDataDir } from "../config/dataDir";
import { contentToPlainText, countImageRefs, IMAGE_TOKEN_ESTIMATE } from "../model/imageParts";
import type { ChatMessage, ChatToolDefinition } from "../model/types";
import { buildEnvironmentContextMessage } from "../prompts/environment";
import { emojiInstruction, languageInstruction, SYSTEM_PROMPT } from "../prompts/system";
import { joinSystemSections, type SystemSection } from "../prompts/systemSections";
import { loadRules } from "../rules/loadRules";
import { loadSkills } from "../skills/loadSkills";
import { getSubagentIndexText } from "../subagents/registry";
import { MCP_CATALOG_SECTION_ID } from "../tools/deferral";
import { listChatTools } from "../tools/schema";
import { getWorkspaceRootOrNull } from "../workspace";
import { loadContextFilesBlock } from "./loadContextFiles";
import { estimateTokens } from "./tokens";

export type AssembleContextInput = {
  messages: ChatMessage[];
  aiLocale: AiLocale;
  allowEmoji?: boolean;
  contextWindow?: number;
  dataDir?: string | null;
  workspaceRoot?: string | null;
  /** 用于 skill slash / paths；默认取最后一条 user。 */
  latestUserText?: string;
  /** 用户 `@` 选中的工作区相对路径。 */
  contextPaths?: string[];
  /** 外部附件引用；文档解析文本并入 `<context_files>`。 */
  attachments?: ChatAttachmentRef[];
  /** 子代理只读：收紧写/ shell / Task。 */
  childReadonly?: boolean;
  /** 是否暴露 Task / task_await。 */
  allowTask?: boolean;
  /** 本 run 已通过 tool_search 装载的 MCP 工具名（延迟加载展开用）。 */
  loadedToolNames?: readonly string[];
  /** 本帧 ChatMode（纯入参；不写 ALS / 进程全局）。 */
  chatMode?: ChatMode;
  /** 注入的静态项目记忆文本（高优先级系统段）。 */
  projectMemory?: string;
  /** 注入的会话抽取记忆文本（高优先级系统段）。 */
  sessionMemory?: string;
};

export type AssembledContext = {
  system: string;
  /** 与 system 同序的分块，供 Trace 折叠展示。 */
  systemSections: SystemSection[];
  tools: ChatToolDefinition[];
  /** tools 的序列化副本；与 segments.tools 同源，避免重复 stringify。 */
  toolsJson: string;
  messages: ChatMessage[];
  segments: ContextUsageSegment[];
  usage: ContextUsageSnapshot;
};

/** 基座 system（不含 environment / rules / skills）。 */
export function buildBaseSystemPrompt(locale: AiLocale, allowEmoji = false): string {
  const parts = [SYSTEM_PROMPT, languageInstruction(locale)];
  const emoji = emojiInstruction(allowEmoji);
  if (emoji) parts.push(emoji);
  return parts.join("\n\n");
}

function latestUserFromMessages(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "user") return contentToPlainText(m.content);
  }
  return "";
}

function conversationText(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const content = contentToPlainText(m.content);
      const imageCount = countImageRefs(m.content);
      const imagePad = imageCount > 0 ? `\n${"x".repeat(IMAGE_TOKEN_ESTIMATE * imageCount)}` : "";
      const tools =
        m.tool_calls && m.tool_calls.length > 0 ? `\n${JSON.stringify(m.tool_calls)}` : "";
      return `${m.role}: ${content}${imagePad}${tools}`;
    })
    .join("\n\n");
}

/**
 * 静态段缓存（system / tools / rules / skills / contextFiles）。
 *
 * 上下文用量每几百毫秒就算一次，而这些段来自磁盘与工具名录，短时间内不会变。
 * 用「短 TTL + 入参指纹」缓存，避免每次都读盘 / 序列化全部工具 JSON。
 * 估算口径必须与真实发送完全一致，所以缓存的是**输入产物**而不是 token 数。
 */
const STATIC_CACHE_TTL_MS = 5_000;

const staticCache = new Map<string, { at: number; value: StaticBundle }>();

/** 对话段 token 记忆：消息没变就复用上次结果，避免每次全量拼接。 */
let conversationCache: { key: string; tokens: number } | null = null;

/** 缓存的静态段产物。 */
type StaticBundle = {
  rules: ReturnType<typeof loadRules>;
  skills: ReturnType<typeof loadSkills>;
  contextFiles: Awaited<ReturnType<typeof loadContextFilesBlock>>;
  bundle: ReturnType<typeof listChatTools>;
  subagentIndex: string;
};

/** 静态段入参指纹：所有会影响产物结果的字段都在里面。 */
function staticCacheKey(
  input: AssembleContextInput,
  resolved: {
    mode: ChatMode;
    dataDir: string | null;
    workspaceRoot: string | null;
    latestUser: string;
    limit: number;
  },
): string {
  return JSON.stringify({
    mode: resolved.mode,
    dataDir: resolved.dataDir,
    workspaceRoot: resolved.workspaceRoot,
    latestUser: resolved.latestUser,
    limit: resolved.limit,
    aiLocale: input.aiLocale,
    allowEmoji: input.allowEmoji ?? false,
    contextPaths: input.contextPaths ?? [],
    attachments: input.attachments ?? [],
    childReadonly: input.childReadonly,
    allowTask: input.allowTask,
    loadedToolNames: input.loadedToolNames ?? [],
  });
}

/** 取静态段（命中则用缓存，未命中则加载并写入缓存）。 */
async function getStaticBundle(
  input: AssembleContextInput,
  resolved: Parameters<typeof staticCacheKey>[1],
): Promise<StaticBundle> {
  const key = staticCacheKey(input, resolved);
  const hit = staticCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < STATIC_CACHE_TTL_MS) return hit.value;

  const value: StaticBundle = {
    rules: loadRules(resolved.dataDir, resolved.workspaceRoot),
    skills: loadSkills(
      resolved.dataDir,
      resolved.workspaceRoot,
      resolved.latestUser,
      input.contextPaths ?? [],
    ),
    contextFiles: await loadContextFilesBlock(
      resolved.workspaceRoot,
      input.contextPaths,
      input.attachments,
    ),
    bundle: listChatTools({
      childReadonly: input.childReadonly,
      allowTask: input.allowTask,
      chatMode: resolved.mode,
      loadedToolNames: input.loadedToolNames,
      contextWindow: resolved.limit,
    }),
    subagentIndex: getSubagentIndexText(),
  };
  // 缓存项数上限保护：指纹组合过多时丢最旧的
  if (staticCache.size > 32) {
    const oldest = staticCache.keys().next();
    if (!oldest.done) staticCache.delete(oldest.value);
  }
  staticCache.set(key, { at: now, value });
  return value;
}

/** 清空静态段缓存（设置变更 / 规则文件更新等场景用）。 */
export function clearStaticContextCache(): void {
  staticCache.clear();
  conversationCache = null;
}

/**
 * 对话段 token 估算：消息序列没变就复用上次结果。
 * 指纹取「条数 + 最后一条的内容长度」，足以排除绝大多数抖动又不会误判。
 */
function conversationTokens(messages: ChatMessage[]): number {
  const last = messages[messages.length - 1];
  const key = `${messages.length}|${last ? contentToPlainText(last.content).length : 0}`;
  if (conversationCache && conversationCache.key === key) return conversationCache.tokens;
  const tokens = estimateTokens(conversationText(messages));
  conversationCache = { key, tokens };
  return tokens;
}

/**
 * 组装完整上下文与分段用量。
 * workspace / dataDir 优先用入参，否则读进程内已配置值。
 */
export async function assembleContext(input: AssembleContextInput): Promise<AssembledContext> {
  const mode = input.chatMode ?? getChatMode();
  const dataDir = input.dataDir !== undefined ? input.dataDir : getDataDir();
  const workspaceRoot =
    input.workspaceRoot !== undefined ? input.workspaceRoot : getWorkspaceRootOrNull();
  const allowEmoji = input.allowEmoji ?? false;
  const limit =
    typeof input.contextWindow === "number" &&
    Number.isFinite(input.contextWindow) &&
    input.contextWindow > 0
      ? Math.floor(input.contextWindow)
      : DEFAULT_CONTEXT_WINDOW;

  const base = buildBaseSystemPrompt(input.aiLocale, allowEmoji);
  const environment = buildEnvironmentContextMessage(input.aiLocale);
  const latestUser = input.latestUserText ?? latestUserFromMessages(input.messages);
  // 规则 / 技能 / 上下文文件 / 工具名录走短 TTL 缓存：它们在几秒内不会变
  const statik = await getStaticBundle(input, {
    mode,
    dataDir,
    workspaceRoot,
    latestUser,
    limit,
  });
  const rules = statik.rules;
  const skills = statik.skills;
  const contextFiles = statik.contextFiles;
  const bundle = statik.bundle;
  const tools = bundle.tools;
  const conversation = conversationText(input.messages);

  const subagentIndex = statik.subagentIndex;
  const memorySection = [input.projectMemory, input.sessionMemory].filter(Boolean).join("\n\n");
  const systemSections: SystemSection[] = [
    { id: "base", text: base },
    { id: "environment", text: environment },
    { id: "mode", text: buildChatModeAddendum(mode) },
  ];
  if (subagentIndex) systemSections.push({ id: "subagents", text: subagentIndex });
  if (rules.text) systemSections.push({ id: "rules", text: rules.text });
  if (skills.text) systemSections.push({ id: "skills", text: skills.text });
  // MCP 索引与 skills 索引同层：都是「能力清单」，供模型决定要不要展开
  if (bundle.catalog) {
    systemSections.push({ id: MCP_CATALOG_SECTION_ID, text: bundle.catalog });
  }
  if (contextFiles.text) systemSections.push({ id: "contextFiles", text: contextFiles.text });
  // 记忆段置于末尾：它是历史会话/项目背景，不能排在 base/mode 前抢锚定，
  // 否则模型会把旧摘要里的 "Task Overview" 当成当前任务（曾导致答非所问）
  if (memorySection) systemSections.push({ id: "memory", text: memorySection });
  const system = joinSystemSections(systemSections);

  const segmentDefs: Array<{ id: ContextUsageSegment["id"]; text: string }> = [
    { id: "system", text: `${base}\n\n${environment}\n\n${subagentIndex}` },
    { id: "tools", text: bundle.json },
    { id: "rules", text: rules.text },
    { id: "skills", text: skills.text },
    { id: "contextFiles", text: contextFiles.plain },
    { id: "memory", text: memorySection },
    { id: "conversation", text: conversation },
  ];
  const segments: ContextUsageSegment[] = segmentDefs.map((s) => ({
    id: s.id,
    // 对话段走「消息未变则复用」的增量估算，其余段开销本身就很小
    tokens: s.id === "conversation" ? conversationTokens(input.messages) : estimateTokens(s.text),
  }));
  const used = segments.reduce((sum, s) => sum + s.tokens, 0);
  const usage: ContextUsageSnapshot = { limit, used, segments };

  return {
    system,
    systemSections,
    tools,
    toolsJson: bundle.json,
    messages: input.messages,
    segments,
    usage,
  };
}
