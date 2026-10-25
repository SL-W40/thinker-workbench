/**
 * contextUsage：与 assembleContext 同源估算上下文占用。
 *
 * 估算失败也必须回包（带 error），否则主进程只能等超时：UI 会停在「看起来是 0」的假值。
 */
import {
  DEFAULT_CONTEXT_WINDOW,
  emptyContextUsageSnapshot,
  type UtilityContextUsage,
} from "@thinker-workbench/shared";
import { assembleContext } from "../../context/assembleContext";
import { getAiLocale, getAllowEmoji, getContextWindow } from "../../model/openai";
import type { ChatMessage } from "../../model/types";
import { setWorkspaceRoot } from "../../workspace";
import {
  applyAllowAiDeleteFiles,
  applyConfig,
  applyDataDir,
  applyWorkspaceAccess,
} from "../configApply";
import { postToParent } from "../port";

/** 估算入口的窗口上限：主进程下发优先（快照路径拿不到明文 key，进程内窗口可能是 undefined）。 */
function resolveLimit(message: UtilityContextUsage): number {
  const fromMessage = message.contextWindow;
  if (typeof fromMessage === "number" && Number.isFinite(fromMessage) && fromMessage > 0) {
    return Math.floor(fromMessage);
  }
  const configured = getContextWindow();
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

export async function onContextUsage(message: UtilityContextUsage): Promise<void> {
  const limit = resolveLimit(message);
  const fail = (reason: string, err?: unknown) => {
    if (err) {
      console.warn(
        `[engine] contextUsage failed (${reason}):`,
        err instanceof Error ? err.message : err,
      );
    }
    postToParent({
      channel: "utility",
      kind: "contextUsageResult",
      requestId: message.requestId,
      usage: emptyContextUsageSnapshot(limit, reason),
    });
  };

  try {
    applyConfig({
      catalog: message.catalog,
      selection: message.selection,
      aiLocale: message.aiLocale,
    });
    applyWorkspaceAccess(message.workspaceAccess);
    applyAllowAiDeleteFiles(message.allowAiDeleteFiles);
    applyDataDir(message.dataDir);
    const workspaceRoot = message.workspaceRoot ?? message.request.workspaceRoot;
    if (workspaceRoot?.trim()) {
      try {
        setWorkspaceRoot(workspaceRoot);
      } catch {
        /* 预览时根无效则继续用已配置根 */
      }
    }

    const messages: ChatMessage[] = (message.request.messages ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const ctx = await assembleContext({
      messages,
      aiLocale: message.aiLocale ?? getAiLocale(),
      allowEmoji: message.allowEmoji ?? getAllowEmoji(),
      contextWindow: limit,
      dataDir: message.dataDir,
      workspaceRoot: workspaceRoot ?? undefined,
      contextPaths: message.request.contextPaths,
      // 会话级 ChatMode 由主进程下发，避免估算回落进程全局导致 mode 段与工具清单不准
      ...(message.chatMode ? { chatMode: message.chatMode } : {}),
    });
    postToParent({
      channel: "utility",
      kind: "contextUsageResult",
      requestId: message.requestId,
      usage: { ...ctx.usage, limit },
    });
  } catch (err) {
    fail("assemble_failed", err);
  }
}
