/**
 * 隔离子代理单轮执行：不写全局 ChatMode、只读能力由 childReadonly 收紧，
 * 结束后把结果与用量摘要回填给父 run。
 */
import { createId, isRecord, type SubagentChildEvent } from "@thinker-workbench/shared";
import { getLimit } from "../../config/runtimeLimits";
import { assembleContext } from "../../context/assembleContext";
import { startedToolCallIdSet } from "../../graph/nodes/toolsResume";
import { chatWithFailover, configureModelCatalog, getModelSelection } from "../../model/catalog";
import { getAiLocale, getAllowEmoji, getContextWindow } from "../../model/openai";
import type { ChatMessage } from "../../model/types";
import { joinSystemSections } from "../../prompts/systemSections";
import {
  getRunContext,
  getRunTurn,
  type RunContext,
  runWithContext,
} from "../../runtime/runContext";
import { getRunEmitter, getRunIds } from "../../runtime/runEmit";
import { getSubagentDefinition, listSubagentDefinitions } from "../../subagents/registry";
import { agentEndSpan, agentStartSpan, runWithAgentTaskId } from "../../trace/emit";
import { getWorkspaceRootOrNull } from "../../workspace";
import { runTool } from "../runTool";
import type { ToolArgs, ToolExecuteResult } from "../types";
import {
  backgroundTasks,
  DEFAULT_AWAIT_MS,
  getModelGate,
  swapModelGate,
} from "./backgroundRegistry";
import {
  emitSubagent,
  formatChildLiveLine,
  formatThinkingLiveLine,
  LIVE_LINE_MAX,
  LIVE_PLANNING,
  LIVE_THINKING,
  SETTLED_SUMMARY_MAX,
} from "./childLiveText";
import { deriveTaskTitle } from "./title";

export function synthesizePartialSummary(messages: ChatMessage[]): string {
  const parts: string[] = [];
  for (let i = messages.length - 1; i >= 0 && parts.length < 4; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "assistant" && typeof m.content === "string" && m.content.trim()) {
      parts.push(m.content.trim());
    }
  }
  parts.reverse();
  const body = parts.join("\n\n").trim();
  if (body) {
    return `Partial report (step budget reached):\n\n${body.slice(0, 6000)}`;
  }
  return "Step budget reached before a final answer. Retry with a narrower prompt.";
}

/** 隔离子代理一轮（供 Task 工具调用）。 */
export async function runChildAgent(options: {
  systemBody: string;
  prompt: string;
  readonly: boolean;
  signal: AbortSignal;
  taskId: string;
  subagent: string;
  /** 业务标题（追踪树展示）。 */
  title?: string;
  background?: boolean;
  /** 非 inherit 时临时切到指定模型 id。 */
  model?: string;
}): Promise<{ ok: boolean; summary: string }> {
  const modelId = options.model?.trim();
  const needsModelSwitch = Boolean(modelId && modelId.toLowerCase() !== "inherit");
  const title = options.title?.trim() || "";

  const childMode = options.readonly ? "ask" : ("agent" as const);
  const parentCtx = getRunContext();
  /**
   * 派生帧：独立 mode/turn/taskIds，不回写父 ALS。
   * 注意 `usage` **不得**重置：`{...parentCtx}` 浅拷贝共享同一个用量账本引用，
   * 子代理消耗的 token 因此自动并入父 run。误改成新对象会让子代理用量凭空消失。
   */
  const childCtx: RunContext | undefined = parentCtx
    ? {
        ...parentCtx,
        chatMode: childMode,
        turn: undefined,
        taskIds: new Set(),
        hitlIds: new Set(),
        // 子代理独立记录已装载的 MCP 工具，不回写父帧
        loadedToolNames: new Set(),
        markToolCallStarted: undefined,
      }
    : undefined;

  const withChildFrame = <T>(work: () => Promise<T>): Promise<T> =>
    childCtx ? runWithContext(childCtx, work) : work();

  // ALS 绑定本 Task：并行 background 时各自异步链互不抢栈
  return runWithAgentTaskId(options.taskId, () =>
    withChildFrame(async () => {
      const subSpanId = agentStartSpan({
        name: `subagent:${options.subagent}`,
        runType: "chain",
        taskId: options.taskId,
        summary: title ? `${options.subagent} · ${title}` : `subagent:${options.subagent}`,
        input: {
          prompt: options.prompt,
          readonly: options.readonly,
          background: options.background ?? false,
          model: options.model,
          ...(title ? { title } : {}),
        },
        attrs: {
          taskId: options.taskId,
          subagent: options.subagent,
          background: options.background ?? false,
          ...(title ? { title } : {}),
        },
      });

      const run = async (): Promise<{ ok: boolean; summary: string }> => {
        const parentSelection = needsModelSwitch ? getModelSelection() : null;
        if (needsModelSwitch && modelId) {
          configureModelCatalog(undefined, { mode: "manual", modelId });
        }

        const emitProgress = (liveLine: string, childEvent?: SubagentChildEvent) => {
          // 主会话已 cancel：勿再推 progress，否则 Background 条会被重新加回
          if (options.signal.aborted) return;
          if (options.background) {
            const entry = backgroundTasks.get(options.taskId);
            if (entry && entry.status !== "running") return;
          }
          emitSubagent("progress", {
            taskId: options.taskId,
            subagent: options.subagent,
            background: options.background,
            liveLine,
            childEvent,
          });
        };

        try {
          const messages: ChatMessage[] = [{ role: "user", content: options.prompt }];
          emitProgress("Starting…", { type: "status", status: "planning" });

          // 执行步数预算：每次模型调用与每次工具执行各计 1 步（与主图 superstep 同语义）
          const maxSteps = getLimit("maxSubagentSteps");
          let usedSteps = 0;
          let modelTurn = 0;
          for (;;) {
            if (options.signal.aborted) {
              return { ok: false, summary: "Subagent cancelled." };
            }
            if (usedSteps >= maxSteps) break;
            usedSteps += 1;
            modelTurn += 1;
            const frame = getRunContext();
            if (frame) frame.turn = modelTurn;
            // 尚无 reasoning：planning；有 thinking token 后再升为 Thinking
            emitProgress(LIVE_PLANNING, { type: "status", status: "planning" });

            const assembled = await assembleContext({
              messages,
              aiLocale: getAiLocale(),
              allowEmoji: getAllowEmoji(),
              contextWindow: getContextWindow(),
              workspaceRoot: getWorkspaceRootOrNull(),
              childReadonly: options.readonly,
              allowTask: false,
              chatMode: childMode,
            });
            const efficiency = [
              "## Subagent execution rules",
              "Work efficiently; prefer fewer than 12 tool calls.",
              "Always end with a final text report (no tool call).",
              "If you cannot finish, summarize findings so far instead of more exploration.",
            ].join("\n");
            const systemSections = [
              { id: "subagent", text: options.systemBody },
              { id: "subagentRules", text: efficiency },
              ...assembled.systemSections,
            ];
            const system = joinSystemSections(systemSections);

            let thinkingBuf = "";
            let replyBuf = "";

            const result = await chatWithFailover(
              {
                messages: assembled.messages,
                tools: assembled.tools,
                system,
                systemSections,
                onToken: (text, channel) => {
                  const ch = channel ?? "reply";
                  if (ch === "thinking") {
                    thinkingBuf += text;
                    emitProgress(formatThinkingLiveLine(thinkingBuf), {
                      type: "token",
                      text,
                      channel: "thinking",
                    });
                  } else {
                    replyBuf += text;
                    const compact = replyBuf.replace(/\s+/g, " ").trim();
                    emitProgress(compact.slice(-LIVE_LINE_MAX) || LIVE_PLANNING, {
                      type: "token",
                      text,
                      channel: "reply",
                    });
                  }
                },
              },
              options.signal,
            );

            const assistant: ChatMessage = {
              role: "assistant",
              content: result.content,
              ...(result.toolCalls.length ? { tool_calls: result.toolCalls } : {}),
            };
            messages.push(assistant);
            const calls = result.toolCalls;
            if (!calls.length) {
              const summary = (result.content || "").trim() || "(empty subagent reply)";
              emitProgress(summary.slice(0, SETTLED_SUMMARY_MAX));
              return { ok: true, summary };
            }
            let budgetOut = false;
            for (const call of calls) {
              if (usedSteps >= maxSteps) {
                budgetOut = true;
                break;
              }
              usedSteps += 1;
              const toolName = call.function?.name ?? "";
              const rawArgs = call.function?.arguments ?? "{}";
              let parsed: ToolArgs = {};
              try {
                parsed = JSON.parse(rawArgs) as ToolArgs;
                if (!isRecord(parsed)) parsed = {};
              } catch {
                parsed = {};
              }
              const line = formatChildLiveLine(toolName, parsed);
              const path =
                typeof parsed.path === "string" && parsed.path.trim()
                  ? parsed.path.trim()
                  : undefined;
              const callId = call.id || createId("call");
              const toolSummary = line.includes(" · ")
                ? line.split(" · ").slice(1).join(" · ")
                : undefined;
              emitProgress(line, {
                type: "tool",
                phase: "start",
                name: toolName,
                callId,
                path,
                summary: toolSummary,
              });
              // 显式打 tool:* span（parent = 当前 subagent；runTool 本身不建 span）
              const childToolSpanId = agentStartSpan({
                name: `tool:${toolName || "unknown"}`,
                runType: "tool",
                taskId: options.taskId,
                summary: toolName || "tool",
                input: parsed,
                attrs: {
                  callId,
                  turn: getRunTurn() ?? modelTurn,
                  ...(path ? { path } : {}),
                },
              });
              let tr: Awaited<ReturnType<typeof runTool>>;
              try {
                tr = await runTool(toolName, parsed, options.signal, callId);
                agentEndSpan(childToolSpanId, {
                  status: tr.ok ? "ok" : "error",
                  output: {
                    ok: tr.ok,
                    output: tr.output,
                    ...(tr.ui ? { ui: tr.ui } : {}),
                  },
                  attrs: { callId, turn: getRunTurn() ?? modelTurn },
                });
              } catch (toolErr) {
                const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
                agentEndSpan(childToolSpanId, {
                  status: /cancel/i.test(errMsg) ? "cancelled" : "error",
                  error: errMsg,
                  attrs: { callId, turn: getRunTurn() ?? modelTurn },
                });
                throw toolErr;
              }
              const output = tr.output;
              const ok = tr.ok;
              const ui = tr.ui;
              emitProgress(line, {
                type: "tool",
                phase: "end",
                name: toolName,
                callId,
                path: ui?.path ?? path,
                summary: toolSummary,
                ok,
                diff: ui?.diff,
                sessionId: ui?.sessionId,
                command: ui?.command,
                exitCode: ui?.exitCode,
                backgrounded: ui?.backgrounded,
                restoreContent: ui?.restoreContent,
                resultPaths: ui?.resultPaths,
                resultPathKinds: ui?.resultPathKinds,
              });
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: output,
              });
            }
            if (budgetOut) break;
          }
          const summary = synthesizePartialSummary(messages);
          return { ok: true, summary };
        } finally {
          if (needsModelSwitch && parentSelection) {
            configureModelCatalog(undefined, parentSelection);
          }
        }
      };

      try {
        const result = !needsModelSwitch
          ? await run()
          : await (async () => {
              // 排队切模型，避免两个子代理互相 restore
              let release!: () => void;
              const prev = getModelGate();
              swapModelGate(
                new Promise<void>((resolve) => {
                  release = resolve;
                }),
              );
              await prev;
              try {
                return await run();
              } finally {
                release();
              }
            })();
        agentEndSpan(subSpanId, {
          status: result.ok ? "ok" : "error",
          output: { summary: result.summary },
          ...(result.ok ? {} : { error: result.summary }),
        });
        return result;
      } catch (err) {
        agentEndSpan(subSpanId, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }),
  );
}
