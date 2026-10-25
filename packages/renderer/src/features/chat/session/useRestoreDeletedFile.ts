/**
 * 时间线 delete_file 的「恢复」：把删前缓存的正文写回工作区并标记 restored。
 */

import { workspaceWriteFile } from "../../../platform/ipc/workspaceFs";
import type { useT } from "../../../ui/i18n/useI18n";
import {
  isDeleteRestoreExpired,
  pruneExpiredDeleteRestoreCaches,
  readDeleteFileRestoreTtlDays,
} from "../timeline";
import type { ChatRunState } from "./useChatRunState";

type Translate = ReturnType<typeof useT>;

export type RestoreDeletedFileDeps = {
  run: ChatRunState;
  t: Translate;
  workspaceId: string | null;
};

export function useRestoreDeletedFile(host: RestoreDeletedFileDeps) {
  const { run, t, workspaceId } = host;
  /**
   * 时间线 delete_file「恢复」：把删前缓存的正文写回工作区，并标记 restored。
   * 失败时抛错，供卡片展示提示。
   */
  async function restoreDeletedFile(messageId: string, stepId: string) {
    const wid = workspaceId;
    if (!wid) throw new Error(t("chat.noWorkspaceLabel"));
    const msg = run.messagesRef.current.find((m) => m.id === messageId);
    const step = msg?.timeline?.find((s) => s.id === stepId);
    if (step?.kind !== "tool" || step.name !== "delete_file") {
      throw new Error("delete_file step not found");
    }
    if (!step.path || typeof step.restoreContent !== "string") {
      throw new Error(t("chat.restoreDeletedFileUnavailable"));
    }

    const ttl = readDeleteFileRestoreTtlDays();
    if (isDeleteRestoreExpired(step, ttl)) {
      // 已超时：清缓存，不可再恢
      const pruned = pruneExpiredDeleteRestoreCaches(run.messagesRef.current, ttl);
      if (pruned !== run.messagesRef.current) {
        run.commitMessages(pruned);
      }
      throw new Error(t("chat.restoreDeletedFileExpired"));
    }

    try {
      await workspaceWriteFile(wid, step.path, step.restoreContent);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }

    run.commitMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.timeline) return m;
        return {
          ...m,
          timeline: m.timeline.map((s) => {
            if (s.id !== stepId || s.kind !== "tool") return s;
            return {
              id: s.id,
              kind: "tool" as const,
              name: s.name,
              callId: s.callId,
              path: s.path,
              summary: s.summary,
              phase: s.phase,
              ok: s.ok,
              diff: s.diff,
              active: s.active,
              restored: true,
            };
          }),
        };
      }),
    );
  }
  return { restoreDeletedFile };
}
