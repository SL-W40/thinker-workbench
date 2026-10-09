/**
 * 统一组装发模型上下文：system / tools / rules / skills / conversation。
 * agent 请求与 Context Usage 估算共用本出口。
 */
import {
  DEFAULT_CONTEXT_WINDOW,
  type AiLocale,
  type ContextUsageSegment,
  type ContextUsageSnapshot,
  emptyContextUsageSnapshot,
} from "@thinker-workbench/shared";
import { getDataDir } from "../config/dataDir";
import {
  emojiInstruction,
  languageInstruction,
  SYSTEM_PROMPT,
} from "../prompts/system";
import { buildEnvironmentContextMessage } from "../prompts/environment";
import { loadRules } from "../rules/loadRules";
import { loadSkills } from "../skills/loadSkills";
import { listChatTools } from "../tools/schema";
import type { ChatMessage, ChatToolDefinition } from "../model/types";
import { getWorkspaceRootOrNull } from "../workspace";
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
};

export type AssembledContext = {
  system: string;
  tools: ChatToolDefinition[];
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
    const m = messages[i]!;
    if (m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

function conversationText(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : "";
      const tools =
        m.tool_calls && m.tool_calls.length > 0
          ? `\n${JSON.stringify(m.tool_calls)}`
          : "";
      return `${m.role}: ${content}${tools}`;
    })
    .join("\n\n");
}

/**
 * 组装完整上下文与分段用量。
 * workspace / dataDir 优先用入参，否则读进程内已配置值。
 */
export function assembleContext(input: AssembleContextInput): AssembledContext {
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
  const rules = loadRules(dataDir, workspaceRoot);
  const latestUser =
    input.latestUserText ?? latestUserFromMessages(input.messages);
  const skills = loadSkills(dataDir, workspaceRoot, latestUser);
  const tools = listChatTools();
  const toolsJson = JSON.stringify(tools);
  const conversation = conversationText(input.messages);

  const systemParts = [base, environment];
  if (rules.text) systemParts.push(rules.text);
  if (skills.text) systemParts.push(skills.text);
  const system = systemParts.join("\n\n");

  const segmentDefs: Array<{ id: ContextUsageSegment["id"]; text: string }> = [
    { id: "system", text: `${base}\n\n${environment}` },
    { id: "tools", text: toolsJson },
    { id: "rules", text: rules.text },
    { id: "skills", text: skills.text },
    { id: "conversation", text: conversation },
  ];
  const segments: ContextUsageSegment[] = segmentDefs.map((s) => ({
    id: s.id,
    tokens: estimateTokens(s.text),
  }));
  const used = segments.reduce((sum, s) => sum + s.tokens, 0);
  const usage: ContextUsageSnapshot = { limit, used, segments };

  return {
    system,
    tools,
    messages: input.messages,
    segments,
    usage,
  };
}

/** utility 未配置工作区时的空用量。 */
export function emptyAssembledUsage(limit?: number): ContextUsageSnapshot {
  return emptyContextUsageSnapshot(limit ?? DEFAULT_CONTEXT_WINDOW);
}
