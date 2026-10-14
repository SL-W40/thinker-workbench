/**
 * 用户附图 → OpenAI 兼容 content parts。
 * 图状态只存 image_ref；发 HTTP 前按路径读文件编 data URL。
 */
import fs from "node:fs";
import path from "node:path";
import { type ChatImageRef, estimateTokens } from "@thinker-workbench/shared";
import { getDataDir } from "../config/dataDir";
import type { ChatContentPart, ChatImageRefPart, ChatMessage, ChatUsage } from "./types";

/** 上下文用量估算：每张附图固定折合 token。 */
export const IMAGE_TOKEN_ESTIMATE = 1600;

/**
 * 网关没回 usage 时的粗估：system + 各轮文本，附图按固定 token 计入 input。
 */
export function estimateTurnUsage(input: {
  system?: string;
  messages: ChatMessage[];
  output?: string;
  reasoning?: string;
}): ChatUsage {
  let inputTokens = estimateTokens(input.system ?? "");
  for (const message of input.messages) {
    const text = contentToPlainText(message.content);
    inputTokens +=
      (text ? estimateTokens(text) : 0) + countImageRefs(message.content) * IMAGE_TOKEN_ESTIMATE;
  }
  const reasoningTokens = input.reasoning ? estimateTokens(input.reasoning) : 0;
  const outputTokens = (input.output ? estimateTokens(input.output) : 0) + reasoningTokens;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens,
  };
}

/** 路径须在 `{dataDir}/workspaces/<id>/images/` 下。 */
export function isAllowedChatImagePath(filePath: string, dataDir?: string | null): boolean {
  const root = (dataDir ?? getDataDir())?.trim();
  if (!root) return false;
  const resolved = path.resolve(filePath);
  const workspacesRoot = path.resolve(root, "workspaces");
  const rel = path.relative(workspacesRoot, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return false;
  const parts = rel.split(path.sep);
  return parts.length >= 3 && parts[1] === "images";
}

/** 从 ChatImageRef 构造图状态 content part。 */
export function toImageRefPart(img: ChatImageRef): ChatImageRefPart {
  return {
    type: "image_ref",
    id: img.id,
    path: img.path,
    mime: img.mime,
  };
}

/**
 * 将用户文本 + 附图拼成模型消息 content。
 * 无文字时补极短 text，避免仅图片消息被网关拒绝。
 */
export function buildUserContent(
  text: string,
  images?: ChatImageRef[] | null,
): string | ChatContentPart[] {
  const trimmed = text.trim();
  const imgs = Array.isArray(images) ? images.filter((i) => i?.path?.trim()) : [];
  if (imgs.length === 0) return trimmed;

  const parts: ChatContentPart[] = [];
  parts.push({ type: "text", text: trimmed || "(image)" });
  for (const img of imgs) {
    parts.push(toImageRefPart(img));
  }
  return parts;
}

/** 抽取消息中的纯文本（用量 / 日志 / 技能匹配）。 */
export function contentToPlainText(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/** 统计消息中的 image_ref 张数。 */
export function countImageRefs(content: ChatMessage["content"]): number {
  if (!Array.isArray(content)) return 0;
  return content.filter((p) => p.type === "image_ref").length;
}

/** 将单条 image_ref 读成 API image_url part；失败则文本说明。 */
export function encodeImageRefPart(
  part: ChatImageRefPart,
  dataDir?: string | null,
): { type: "image_url"; image_url: { url: string } } | { type: "text"; text: string } {
  const filePath = part.path?.trim() ?? "";
  const name = path.basename(filePath) || part.id || "image";
  if (!filePath || !isAllowedChatImagePath(filePath, dataDir)) {
    return { type: "text", text: `[image unavailable: ${name}]` };
  }
  try {
    const buf = fs.readFileSync(path.resolve(filePath));
    if (buf.byteLength === 0) {
      return { type: "text", text: `[image unavailable: ${name}]` };
    }
    const mime = part.mime?.trim() || guessMime(filePath);
    return {
      type: "image_url",
      image_url: { url: `data:${mime};base64,${buf.toString("base64")}` },
    };
  } catch {
    return { type: "text", text: `[image unavailable: ${name}]` };
  }
}

/** 将图状态消息映射为发往 `/chat/completions` 的 API 形态。 */
export function messageToApiContent(message: ChatMessage, dataDir?: string | null): unknown {
  const { role, content, name, tool_call_id, tool_calls } = message;
  const base: Record<string, unknown> = { role };
  if (name) base.name = name;
  if (tool_call_id) base.tool_call_id = tool_call_id;
  if (tool_calls) base.tool_calls = tool_calls;

  if (content == null) {
    base.content = null;
    return base;
  }
  if (typeof content === "string") {
    base.content = content;
    return base;
  }
  if (!Array.isArray(content)) {
    base.content = "";
    return base;
  }

  const encoded = content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    return encodeImageRefPart(part, dataDir);
  });
  base.content = encoded;
  return base;
}

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}
