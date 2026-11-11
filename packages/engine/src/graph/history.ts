/**
 * 把聊天记录投影成模型消息。
 * 新轮次只从这份投影进入图；resume 不走这里，它读的是检查点里的 ModelMessage。
 */
import type { ChatImageRef } from "@thinker-workbench/shared";
import { buildUserContent, contentToPlainText } from "../model/imageParts";
import type { ModelMessage } from "../model/types";

/** 调用方传来的历史：UI 消息或已经是模型消息。 */
export type HistoryTurn = {
  role: string;
  content: string | ModelMessage["content"];
  images?: ChatImageRef[];
};

/**
 * 保留有正文或附图的 user / assistant。
 * tool 角色、空正文、以及 UI 时间线都不进入模型上下文。
 */
export function projectModelHistory(
  history: ReadonlyArray<HistoryTurn | ModelMessage> | undefined,
): ModelMessage[] {
  if (!history?.length) return [];
  const out: ModelMessage[] = [];
  for (const raw of history) {
    if (raw.role !== "user" && raw.role !== "assistant") continue;
    const images = "images" in raw && Array.isArray(raw.images) ? raw.images : undefined;
    if (raw.role === "user" && images?.length) {
      const text =
        typeof raw.content === "string" ? raw.content : contentToPlainText(raw.content);
      out.push({ role: "user", content: buildUserContent(text, images) });
      continue;
    }
    const content =
      typeof raw.content === "string"
        ? raw.content.trim()
        : contentToPlainText(raw.content).trim();
    if (!content) continue;
    out.push({ role: raw.role, content });
  }
  return out;
}
