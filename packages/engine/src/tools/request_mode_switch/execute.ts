/**
 * request_mode_switch：向用户请求切换会话 ChatMode，等答复。
 *
 * 切换真正的落盘在主进程（HITL 答复收口处写 app_kv），这里只负责：
 * 1) 发 HITL 请求并挂起；2) 用户同意后本 run 立即生效（后续回合按新模式取工具集）。
 */
import { CHAT_MODES, type ChatMode, isChatMode } from "@thinker-workbench/shared";
import { getChatMode, setChatMode } from "../../chatMode";
import { requestHitl } from "../../hitl/requestHitl";
import { getRunIds } from "../../runtime/runEmit";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";

/** 理由文案上限（卡片只显示一行，多余内容无意义）。 */
const REASON_MAX = 300;

/** 读 target 参数；非法返回 null。 */
function parseTarget(value: unknown): ChatMode | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  return isChatMode(raw) ? raw : null;
}

export async function requestModeSwitchTool(
  args: ToolArgs,
  ctx?: ToolContext,
): Promise<ToolExecuteResult> {
  const target = parseTarget(args.target);
  if (!target) {
    return {
      ok: false,
      output: `request_mode_switch 的 target 必须是 ${CHAT_MODES.join(" / ")} 之一。`,
    };
  }

  const current = getChatMode();
  if (current === target) {
    return { ok: false, output: `当前已经是 ${current} 模式，无需切换。` };
  }

  const reason = typeof args.reason === "string" ? args.reason.trim().slice(0, REASON_MAX) : "";
  const sessionId = getRunIds()?.sessionId ?? "";

  const response = await requestHitl(
    {
      kind: "mode_switch",
      title: `Switch to ${target} mode?`,
      body: reason || `The task needs ${target} mode.`,
      // sessionId 供主进程落盘（引擎无 DB）；targetMode 是切换目标
      payload: {
        targetMode: target,
        currentMode: current,
        ...(sessionId ? { sessionId } : {}),
        reason,
      },
      actions: [
        { id: "switch", label: `Switch to ${target}`, style: "primary" },
        { id: "stay", label: `Stay in ${current}`, style: "ghost" },
      ],
    },
    ctx?.signal,
  );

  if (response.actionId !== "switch") {
    return {
      ok: true,
      output: `用户选择保持 ${current} 模式，未切换。请在 ${current} 模式允许的范围内继续，不要重复请求切换。`,
    };
  }

  // 本 run 立即生效：下一回合的 tools / 模式附录按新模式生成
  setChatMode(target);
  return {
    ok: true,
    output: `用户已同意切换到 ${target} 模式，本 run 立刻生效。继续任务，不要再重复请求切换。`,
  };
}
