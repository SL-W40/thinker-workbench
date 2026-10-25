/**
 * resume：从 checkpoint 恢复一轮运行。
 */
import type { UtilityResume } from "@thinker-workbench/shared";
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

export async function onResume(ctx: HostContext, message: UtilityResume): Promise<void> {
  const { runId } = message;
  const { threadId } = message.command;
  try {
    applyConfig({
      catalog: message.catalog,
      selection: message.selection,
      aiLocale: message.aiLocale,
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
      traceId: message.command.traceId,
      threadId: message.command.threadId,
      title: message.sessionTitle,
    });
    if (message.workspaceRoot) {
      setWorkspaceRoot(message.workspaceRoot, { name: message.command.workspaceName });
    }
    const runtime = ctx.ensureRuntime(message.checkpointDir);
    const root = message.workspaceRoot?.trim() || "";
    const emit = bindRuntimeEmitter(
      (e) => runtime.events.emit(e),
      threadId,
      message.runId,
      message.sessionId,
    );
    const runContext = root
      ? buildRunContext({
          runId: message.runId,
          threadId,
          sessionId: message.sessionId,
          workspaceRoot: root,
          workspaceName: message.command.workspaceName,
          dataDir: message.dataDir,
          workspaceId: message.workspaceId,
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
          // 续跑同样播种会话待办
          todos: message.sessionTodos,
          emit,
        })
      : undefined;
    await runtime.resume({
      ...message.command,
      sessionId: message.sessionId,
      runId: message.runId,
      ...(runContext ? { runContext } : {}),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    postToParent({
      channel: "utility",
      kind: "event",
      event: {
        type: "error",
        threadId,
        runId,
        ts: Date.now(),
        error,
        code: "failed",
        ...(message.sessionId ? { chatSessionId: message.sessionId } : {}),
      },
    });
  }
}
