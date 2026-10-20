/**
 * run：组装 RunContext 并启动一轮 Agent 运行。
 */
import type { UtilityRun } from "@thinker-workbench/shared";
import { setChatMode } from "../../chatMode";
import { resolveRuntimeLimits } from "../../config/runtimeLimits";
import { buildRunContext } from "../../runtime/buildRunContext";
import { bindRuntimeEmitter } from "../../runtime/runEmit";
import { setSubagentDefinitions } from "../../subagents/registry";
import { configureAgentTrace } from "../../trace/emit";
import { setWorkspaceRoot } from "../../workspace";
import { applyConfig, applyDataDir, applyRuntimeSettings, applyTrace } from "../configApply";
import type { HostContext } from "../hostContext";
import { postToParent } from "../port";

export async function onRun(ctx: HostContext, message: UtilityRun): Promise<void> {
  const traceId = message.traceId || message.command.traceId;
  const text = typeof message.command.message === "string" ? message.command.message : "";
  const workspaceRoot = message.workspaceRoot ?? message.command.workspaceRoot;
  const workspaceName = message.command.workspaceName;
  const runImages = Array.isArray(message.command.images)
    ? message.command.images.filter((i) => i && typeof i.path === "string" && i.path.trim())
    : [];
  const historyHasImages = (message.command.history ?? []).some(
    (m) => m.role === "user" && Array.isArray(m.images) && m.images.length > 0,
  );
  applyConfig({
    catalog: message.catalog,
    selection: message.selection,
    aiLocale: message.aiLocale,
    route: {
      userText: text,
      contextPaths: message.command.contextPaths,
      hasImages: runImages.length > 0 || historyHasImages,
    },
  });
  setChatMode(message.chatMode);
  if (message.subagents) setSubagentDefinitions(message.subagents);
  applyRuntimeSettings(message);
  // 限额随本 run 的 RunContext 传递，不写进程全局（并发 run 互踩）
  const limits = resolveRuntimeLimits(message);
  applyDataDir(message.dataDir);
  applyTrace(ctx.ensureRuntime, message.trace);
  configureAgentTrace({
    sessionId: message.sessionId,
    workspaceId: message.workspaceId,
    runId: message.runId,
    traceId: message.traceId,
    threadId: message.threadId,
    title: message.sessionTitle,
  });
  if (!workspaceRoot?.trim()) {
    postToParent({
      channel: "utility",
      kind: "event",
      event: {
        type: "error",
        threadId: message.threadId,
        runId: message.runId,
        ts: Date.now(),
        error: "No workspace root configured. Open a workspace before chatting.",
        code: "failed",
      },
    });
    return;
  }
  try {
    // 进程默认（无 ALS 路径）；本 run 以下方 RunContext 为准
    setWorkspaceRoot(workspaceRoot, { name: workspaceName });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    postToParent({
      channel: "utility",
      kind: "event",
      event: {
        type: "error",
        threadId: message.threadId,
        runId: message.runId,
        ts: Date.now(),
        error,
        code: "failed",
        ...(message.sessionId ? { chatSessionId: message.sessionId } : {}),
      },
    });
    return;
  }
  const runtime = ctx.ensureRuntime();
  const emit = bindRuntimeEmitter(
    (e) => runtime.events.emit(e),
    message.threadId,
    message.runId,
    message.sessionId,
  );
  const runContext = buildRunContext({
    runId: message.runId,
    threadId: message.threadId,
    sessionId: message.sessionId,
    workspaceRoot,
    workspaceName,
    dataDir: message.dataDir,
    chatMode: message.chatMode,
    workspaceAccess: message.workspaceAccess,
    allowAiDeleteFiles: message.allowAiDeleteFiles,
    allowAiShell: message.allowAiShell,
    allowAiBrowser: message.allowAiBrowser,
    shellApprovalMode: message.shellApprovalMode,
    shellAllowlist: message.shellAllowlist,
    shellBlocklist: message.shellBlocklist,
    shell: message.shell,
    catalog: message.catalog,
    selection: message.selection,
    limits,
    route: {
      userText: text,
      contextPaths: message.command.contextPaths,
      hasImages: runImages.length > 0 || historyHasImages,
    },
    emit,
  });
  await runtime.run({
    runId: message.runId,
    threadId: message.threadId,
    sessionId: message.sessionId,
    traceId,
    queuedMs: message.queuedMs,
    message: text,
    images: runImages.length > 0 ? runImages : undefined,
    history: message.command.history,
    contextPaths: message.command.contextPaths,
    attachments: message.command.attachments,
    workspaceRoot,
    workspaceName,
    runContext,
  });
}
