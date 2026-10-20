/**
 * RunTimeline 纯函数：路径 / 标签 / 时长 / 规划行判定（不依赖 React）。
 */
import type { ChatTimelineResultPathKind, ChatTimelineStep } from "@thinker-workbench/shared";
import type { useT } from "../../../i18n/useI18n";
import type { ExploreGroup } from "../timelineExplore";

export type ResultPathKind = ChatTimelineResultPathKind;

export type Translate = ReturnType<typeof useT>;

/** 路径末段文件名*/
export function pathBasename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

/** 探索路径列表 key：路径可能重复，附加序号保证唯一（列表顺序固定不重排）。 */
export function exploreFileKey(path: string, index: number): string {
  return `${path}-${index}`;
}

/** 解析列表项类型：显式 kinds 优先，其次路径尾缀*/
export function resolvePathKind(path: string, kind?: ResultPathKind): ResultPathKind {
  if (kind === "dir" || kind === "link" || kind === "file" || kind === "image") return kind;
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(path)) return "image";
  if (/[/\\]$/.test(path)) return "dir";
  return "file";
}

/** 搜索类：摘要优先（pattern），路径次之*/
export function isSearchToolName(name: string): boolean {
  return name === "grep" || name === "search_files";
}

/** await 行里的短 id（taskId / sessionId）*/
export function shortenAwaitId(raw: string, max = 14): string {
  const s = raw.trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1))}…`;
}

/** 短于此时长显示 “Thought briefly” / 「已思考片刻」。*/
export const THOUGHT_BRIEF_MS = 1500;

/** 思考耗时展示如 2s / 12s（不用 briefly）。*/
export function formatThinkingDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0.1, Math.round(ms / 100) / 10)}s`;
  const sec = ms / 1000;
  if (sec < 10) {
    const rounded = Math.round(sec * 10) / 10;
    return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}s`;
  }
  return `${Math.round(sec)}s`;
}

/** Thought briefly / Thought 1.2s*/
export function formatThoughtLabel(t: Translate, durationMs: number | undefined): string {
  if (durationMs == null || durationMs <= 0 || durationMs < THOUGHT_BRIEF_MS) {
    return t("chat.thoughtBriefly");
  }
  return `${t("chat.thought")} ${formatThinkingDuration(durationMs)}`;
}

/** Explored 4 files, 2 searches / 已探索 4 个文件，2 次搜索。*/
export function formatExploreLabel(t: Translate, group: ExploreGroup): string {
  const verb = group.active ? t("chat.exploring") : t("chat.explored");
  const parts: string[] = [];
  if (group.fileCount > 0) {
    parts.push(
      t(group.fileCount === 1 ? "chat.exploreFileOne" : "chat.exploreFileMany").replace(
        "{n}",
        String(group.fileCount),
      ),
    );
  }
  if (group.searchCount > 0) {
    parts.push(
      t(group.searchCount === 1 ? "chat.exploreSearchOne" : "chat.exploreSearchMany").replace(
        "{n}",
        String(group.searchCount),
      ),
    );
  }
  if (group.pageCount > 0) {
    parts.push(
      t(group.pageCount === 1 ? "chat.explorePageOne" : "chat.explorePageMany").replace(
        "{n}",
        String(group.pageCount),
      ),
    );
  }
  if (parts.length === 0) return verb;
  return `${verb} ${parts.join(t("chat.exploreJoin"))}`;
}

/**
 * 空闲临时 Planning：无活动工具、末尾无正文流式时显示。
 * 有活动 Thinking 时由 StatusStepRow 处理（无正文也显示 Planning）。
 * `live` 须为真正在跑（busy+pending），避免中断后永远 Planning。
 */
export function shouldShowPlanning(steps: ChatTimelineStep[], live: boolean): boolean {
  if (!live) return false;
  for (const step of steps) {
    if (step.kind === "status" && step.status === "thinking" && step.active) return false;
    if (step.kind === "tool" && step.phase === "start" && step.active) return false;
  }
  const last = steps[steps.length - 1];
  if (last?.kind === "text" && last.text.trim()) return false;
  return true;
}
