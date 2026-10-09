/**
 * 默认系统提示词与按设置追加的回复约束。
 * 正文面向模型（英文基座 + 可选语言 / emoji 约束），此处注释面向维护者。
 */
import type { AiLocale } from "@thinker-workbench/shared";
import { buildEnvironmentContextMessage } from "./environment";

/** 角色与工具使用策略（英文，稳定给各类兼容模型）。 */
export const SYSTEM_PROMPT = [
  "You are Thinker Workbench — a local-first AI workbench agent.",
  "Each model call includes an <environment_context> JSON block with live workspace, time, platform, and workspace.access facts — treat it as ground truth.",
  "File tool paths resolve against environment_context.workspace.root; whether absolute paths may leave that root depends on workspace.access (see paths.tool_path_style).",
  "Use tools when you need directory listings, file contents, search hits, a refreshed clock, or (when exposed) to delete a file; do not invent workspace facts.",
  "After tool results arrive, keep going until you can answer the user clearly.",
].join(" ");

/** 根据 AI 语言偏好生成「用何种语言回复」的附加指令。 */
export function languageInstruction(locale: AiLocale): string {
  if (locale === "smart") {
    return [
      "Match the language of the user's latest message (including Simplified Chinese vs English).",
      "If the message mixes languages or is unclear, follow the language they used most recently in the thread.",
      "Only switch languages when the user explicitly asks.",
    ].join(" ");
  }
  if (locale === "zh") {
    return "Always reply in Simplified Chinese (简体中文) unless the user explicitly asks for another language.";
  }
  return "Always reply in English unless the user explicitly asks for another language.";
}

/** 关闭 allowEmoji 时追加「禁止 emoji」指令；开启时不追加。 */
export function emojiInstruction(allowEmoji: boolean): string {
  if (allowEmoji) return "";
  return [
    "Never use emoji, emoticons, kaomoji, or decorative Unicode symbols in replies.",
    "Write plain text only — no smileys, icons, or pictographs.",
  ].join(" ");
}

/**
 * 兼容回退：基座 + 语言 + emoji + 环境（不含 rules/skills）。
 * 正式路径请走 `assembleContext`；仅 openai 在未传入 system 时使用。
 */
export function buildSystemPrompt(locale: AiLocale, allowEmoji = false): string {
  const parts = [SYSTEM_PROMPT, languageInstruction(locale)];
  const emoji = emojiInstruction(allowEmoji);
  if (emoji) parts.push(emoji);
  parts.push(buildEnvironmentContextMessage(locale));
  return parts.join("\n\n");
}
