/**
 * 会话导出 / 导入。
 *
 * 导出两种：
 * - Markdown：给人看（纪律 question/answer 段落 + 角色小标题）
 * - JSON：无损往返（含 statistics / timeline 字段与角色原文），带 `version` 便于演进
 *
 * 导入一律**新建会话**，绝不覆盖既有会话；未知 version 直接拒绝。
 * 导出内容不含凭证（消息正文里若由用户自己写了密钥，导出前会做一次掩码）。
 */
import { writeFile } from "node:fs/promises";
import type {
  ChatExportInput,
  ChatExportResult,
  ChatImportInput,
  ChatImportResult,
  ChatMessage,
} from "@thinker-workbench/shared";
import { CHAT_EXPORT_VERSION } from "@thinker-workbench/shared";
import { getSessionWithMessages, saveMessagesToDb } from "../db/workspacesStore/messages";
import { createSession, getSession } from "../db/workspacesStore/sessions";
import { desktopLog } from "../log/setup";

const log = desktopLog("chatExport");

/** 角色 → Markdown 小标题。 */
const ROLE_LABEL: Record<string, string> = {
  user: "### 🧑 User",
  assistant: "### 🤖 Assistant",
  tool: "### 🔧 Tool",
  system: "### ⚙️ System",
};

/** 导出文件的 JSON 结构（导入侧校验的依据）。 */
export type ChatExportPayload = {
  version: number;
  exportedAt: number;
  session: {
    id: string;
    threadId: string;
    title: string;
    workspaceId: string;
  };
  messages: Array<{
    role: string;
    text: string;
    createdAt: number;
  }>;
};

/** 简单脱敏：常见密钥赋值整行替换为占位。 */
function maskSecrets(text: string): string {
  return text.replace(/(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{8,})/g, "[redacted]");
}

/**
 * 取消息正文纯文本。
 * 渲染侧对外导出的是「已渲染文本」：`ChatMessage.text` 是渲染后的正文，
 * 工具分流、图片占位等内部内容不属于导出范围，因此这里不做二次渲染。
 */
function plainText(text: unknown): string {
  return typeof text === "string" ? text : "";
}

/** 把消息渲染成 Markdown。 */
export function renderSessionMarkdown(title: string, messages: ChatMessage[]): string {
  const lines: string[] = [`# ${title}`, "", `_导出时间：${new Date().toLocaleString()}_`, ""];
  for (const msg of messages) {
    const label = ROLE_LABEL[msg.role] ?? `### ${msg.role}`;
    lines.push(label, "", maskSecrets(plainText(msg.text)), "");
  }
  return lines.join("\n");
}

/** 构造无损 JSON 载荷。 */
export function buildExportPayload(
  session: { id: string; threadId: string; title: string; workspaceId: string },
  messages: ChatMessage[],
): ChatExportPayload {
  return {
    version: CHAT_EXPORT_VERSION,
    exportedAt: Date.now(),
    session,
    messages: messages.map((m) => ({
      role: m.role,
      text: plainText(m.text),
      createdAt: m.createdAt ?? Date.now(),
    })),
  };
}

/** 文件名安全化：去掉 Windows 非法字符。 */
export function safeFileName(title: string, ext: string): string {
  const base = title.replace(/[\\/:*?"<>|]/g, "_").trim() || "chat";
  return `${base.slice(0, 80)}.${ext}`;
}

/**
 * 导出单个会话。
 * 给了 targetPath 就落盘；否则返回内容字符串（便于 UI 预览 / 自行保存）。
 */
export async function exportChatSession(input: ChatExportInput): Promise<ChatExportResult> {
  try {
    const session = getSession(input.sessionId);
    if (!session) return { ok: false, format: input.format, error: "会话不存在" };
    const rows = getSessionWithMessages(input.sessionId)?.messages ?? [];
    const meta = {
      id: session.id,
      threadId: session.threadId,
      title: session.title,
      workspaceId: session.workspaceId,
    };
    const content =
      input.format === "json"
        ? JSON.stringify(buildExportPayload(meta, rows), null, 2)
        : renderSessionMarkdown(session.title, rows);
    const fileName = safeFileName(session.title, input.format === "json" ? "json" : "md");
    if (input.targetPath) {
      await writeFile(input.targetPath, content, "utf8");
      return { ok: true, format: input.format, path: input.targetPath, fileName };
    }
    return { ok: true, format: input.format, content, fileName };
  } catch (err) {
    log.warn("导出会话失败", { sessionId: input.sessionId, error: String(err) });
    return { ok: false, format: input.format, error: String(err) };
  }
}

/** 校验导入载荷；返回 null 表示通过，否则返回原因。 */
export function validateImportPayload(content: string): {
  ok: boolean;
  payload?: ChatExportPayload;
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: "不是合法的 JSON 文件" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "文件内容为空" };
  const payload = parsed as Partial<ChatExportPayload>;
  if (typeof payload.version !== "number") return { ok: false, error: "缺少 version 字段" };
  if (payload.version !== CHAT_EXPORT_VERSION) {
    return { ok: false, error: `不支持的导出版本：${payload.version}` };
  }
  if (!Array.isArray(payload.messages)) return { ok: false, error: "缺少 messages 字段" };
  return { ok: true, payload: payload as ChatExportPayload };
}

/**
 * 导入会话：始终新建会话，不覆盖任何既有会话。
 * 标题默认沿用导出时的标题，并加后缀标明来源。
 */
export async function importChatSession(input: ChatImportInput): Promise<ChatImportResult> {
  try {
    const checked = validateImportPayload(input.content ?? "");
    if (!checked.ok || !checked.payload) {
      return { ok: false, error: checked.error ?? "导入内容无效" };
    }
    const payload = checked.payload;
    const rawTitle = (input.title?.trim() || payload.session?.title || "导入的会话").slice(0, 120);
    const session = createSession(input.workspaceId, `${rawTitle}（导入）`);
    const messages = payload.messages.slice(0, 20_000).map((m, index) => ({
      id: `import-${session.id}-${index}`,
      role: (m.role ?? "user") as ChatMessage["role"],
      text: m.text ?? "",
      createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.now(),
    }));
    saveMessagesToDb(session.workspaceId, session.id, messages);
    return {
      ok: true,
      sessionId: session.id,
      title: session.title,
      messageCount: messages.length,
    };
  } catch (err) {
    log.warn("导入会话失败", { workspaceId: input.workspaceId, error: String(err) });
    return { ok: false, error: String(err) };
  }
}
