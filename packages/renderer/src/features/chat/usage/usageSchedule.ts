/**
 * 上下文占用估算的调度纯函数（指纹 / 是否发起 / 防抖时长 / 请求体）。
 *
 * 抽出来是为了可单测：真正的 bug 是「防抖定时器被清掉后再也不补发」，
 * 这类时序问题只有纯函数断言得住，组件里靠肉眼很难回归。
 */
import type { ChatMessage, ContextUsageRequest } from "@thinker-workbench/shared";
import { visibleAssistantText } from "../message/messageModel";

/** 上下文估算的输入指纹入参。 */
export type UsageSignatureInput = {
  messages: ChatMessage[];
  draft: string;
  workspaceRoot?: string | null;
  /**
   * 强制刷新计数（切换模型 / 模式等：正文没变但估算会变的场景）。
   * 递增即视为指纹变化。
   */
  refreshToken?: number;
};

/**
 * 输入指纹：只取「会影响用量」的值，不含数组引用。
 *
 * 用字符和而非仅末条长度：中间某条被改写（编辑、错误重述）也要触发重算。
 */
export function buildUsageSignature(input: UsageSignatureInput): string {
  const { messages, draft, workspaceRoot, refreshToken = 0 } = input;
  let total = 0;
  let lastLen = 0;
  let pending = 0;
  for (const m of messages) {
    const len = m.role === "assistant" ? visibleAssistantText(m).length : (m.text?.length ?? 0);
    total += len;
    lastLen = len;
    if (m.pending) pending += 1;
  }
  return [
    messages.length,
    total,
    lastLen,
    pending,
    draft.length,
    draft.trim().length,
    workspaceRoot ?? "",
    refreshToken,
  ].join("|");
}

/**
 * 本次是否该发起估算。
 *
 * 打开态：一律重算（面板可见，值得灵敏跟随）。
 * 关闭态：只有指纹变过才重算，避免无意义 IPC。
 */
export function shouldRequestUsage(
  open: boolean,
  signature: string,
  askedSignature: string | null,
): boolean {
  if (open) return true;
  return signature !== askedSignature;
}

/** 防抖：面板打开时精细跟随输入，关闭时明显降频。 */
export function usageDebounceMs(open: boolean): number {
  return open ? 80 : 1000;
}

/** 上下文估算请求体可用的最大对话条数（超出保留最近的）。 */
const MAX_USAGE_MESSAGES = 200;

/**
 * UI 消息 + 草稿 → 估算请求正文。
 *
 * 流式中的 pending 助手也计入：conversation 段才能在输出过程中可见增长；
 * 空正文仍跳过，避免把「还没生成」算成 0 之外的内容。
 */
export function toUsageMessages(
  messages: ChatMessage[],
  draft: string,
): NonNullable<ContextUsageRequest["messages"]> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.role === "user") {
      const content = m.text?.trim() ?? "";
      if (content) out.push({ role: "user", content });
    } else if (m.role === "assistant") {
      const content = visibleAssistantText(m);
      if (content) out.push({ role: "assistant", content });
    }
  }
  const d = draft.trim();
  if (d) out.push({ role: "user", content: d });
  // 超长会话只估最近若干轮：估算本身是粗估，没必要逐条全传给子进程
  return out.length > MAX_USAGE_MESSAGES ? out.slice(-MAX_USAGE_MESSAGES) : out;
}
