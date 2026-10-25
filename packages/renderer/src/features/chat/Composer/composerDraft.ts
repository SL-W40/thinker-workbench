/**
 * Composer 草稿本地持久化：按会话留一份「输入框正文 + 外部附件引用」。
 *
 * 刷新 / 重启回到同一会话时把草稿灌回输入框，避免没发出去的内容丢掉。
 * 走 localStorage（与 inspector UI / 最近文件同一挂靠方式，随 Electron 分区持久化）；
 * 写盘带防抖，页面卸载前兜底 flush。
 */

import type { AttachmentKind, ChatAttachmentRef } from "@thinker-workbench/shared";

const STORAGE_KEY = "thinker.composer.draft.v1";
/** 最多保留多少会话的草稿（超出按最近更新丢弃）。 */
const MAX_SESSIONS = 20;
/** 单条正文上限字符，避免长文本撑爆配额。 */
const MAX_TEXT = 20_000;
/** 单条最多保留的附件引用。 */
const MAX_ATTACHMENTS = 32;
/** 写盘防抖窗口；窗口内多次输入只落最后一次。 */
const WRITE_DELAY_MS = 250;

/** 一份会话草稿。 */
export type ComposerDraft = {
  text: string;
  attachments: ChatAttachmentRef[];
};

type StoredDraft = ComposerDraft & {
  /** 最近写入时间戳，用于淘汰最旧的会话。 */
  at: number;
};

const KINDS: AttachmentKind[] = ["image", "audio", "video", "document", "other"];

/** 待写盘队列：`null` 表示删除该会话草稿。 */
const pending = new Map<string, ComposerDraft | null>();
let timer: number | null = null;

function isAttachmentRef(value: unknown): value is ChatAttachmentRef {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.path === "string" &&
    typeof v.mime === "string" &&
    typeof v.size === "number" &&
    KINDS.includes(v.kind as AttachmentKind)
  );
}

function toStoredDraft(value: unknown): StoredDraft | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { text?: unknown; attachments?: unknown; at?: unknown };
  const text = typeof v.text === "string" ? v.text : "";
  if (!text.trim()) return null;
  const attachments = Array.isArray(v.attachments)
    ? v.attachments.filter(isAttachmentRef).slice(0, MAX_ATTACHMENTS)
    : [];
  return {
    text,
    attachments,
    at: typeof v.at === "number" ? v.at : 0,
  };
}

/** 读全量存档；损坏或不可用返回空表。 */
function readStore(): Record<string, StoredDraft> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, StoredDraft> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const draft = toStoredDraft(value);
      if (draft) out[key] = draft;
    }
    return out;
  } catch {
    return {};
  }
}

/** 按更新时间保留最近的若干会话。 */
function prune(store: Record<string, StoredDraft>): Record<string, StoredDraft> {
  const keys = Object.keys(store);
  if (keys.length <= MAX_SESSIONS) return store;
  const keep = new Set(
    keys.sort((a, b) => (store[b]?.at ?? 0) - (store[a]?.at ?? 0)).slice(0, MAX_SESSIONS),
  );
  const out: Record<string, StoredDraft> = {};
  for (const key of keys) {
    if (keep.has(key)) out[key] = store[key];
  }
  return out;
}

/** 立即把队列里的草稿写盘（含删除）。 */
export function flushComposerDrafts(): void {
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (pending.size === 0) return;
  const writes = new Map(pending);
  pending.clear();
  try {
    const store = readStore();
    for (const [sessionId, draft] of writes) {
      // 空正文视为「没有草稿」：发完消息 / 输入框清空即撤档
      if (!draft?.text.trim()) {
        delete store[sessionId];
        continue;
      }
      store[sessionId] = {
        text: draft.text.slice(0, MAX_TEXT),
        attachments: draft.attachments.filter(isAttachmentRef).slice(0, MAX_ATTACHMENTS),
        at: Date.now(),
      };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prune(store)));
  } catch {
    /* 配额 / 隐私模式：存档失败不应影响输入本身 */
  }
}

function scheduleFlush(): void {
  if (timer != null) return;
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
    flushComposerDrafts();
    return;
  }
  timer = window.setTimeout(() => {
    timer = null;
    flushComposerDrafts();
  }, WRITE_DELAY_MS);
}

/** 取某会话的本地草稿；无 / 损坏返回 null。 */
export function loadComposerDraft(sessionId: string | null): ComposerDraft | null {
  if (!sessionId) return null;
  const stored = readStore()[sessionId];
  if (!stored) return null;
  return { text: stored.text, attachments: stored.attachments };
}

/** 写入草稿（防抖）；空正文会撤档。 */
export function saveComposerDraft(sessionId: string | null, draft: ComposerDraft): void {
  if (!sessionId) return;
  if (!draft.text.trim()) {
    clearComposerDraft(sessionId);
    return;
  }
  pending.set(sessionId, draft);
  scheduleFlush();
}

/** 丢掉某会话的本地草稿（切会话 / 发送成功后调用端的清档也走写盘队列）。 */
export function clearComposerDraft(sessionId: string | null): void {
  if (!sessionId) return;
  pending.set(sessionId, null);
  scheduleFlush();
}
