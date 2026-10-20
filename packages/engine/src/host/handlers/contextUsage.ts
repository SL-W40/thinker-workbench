/**
 * contextUsage：与 assembleContext 同源估算上下文占用。
 */
import { emptyContextUsageSnapshot, type UtilityContextUsage } from "@thinker-workbench/shared";
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

export async function onContextUsage(message: UtilityContextUsage): Promise<void> {
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

  try {
    const ctx = await assembleContext({
      messages,
      aiLocale: message.aiLocale ?? getAiLocale(),
      allowEmoji: getAllowEmoji(),
      contextWindow: getContextWindow(),
      dataDir: message.dataDir,
      workspaceRoot: workspaceRoot ?? undefined,
      contextPaths: message.request.contextPaths,
    });
    postToParent({
      channel: "utility",
      kind: "contextUsageResult",
      requestId: message.requestId,
      usage: ctx.usage,
    });
  } catch {
    postToParent({
      channel: "utility",
      kind: "contextUsageResult",
      requestId: message.requestId,
      usage: emptyContextUsageSnapshot(getContextWindow()),
    });
  }
}
