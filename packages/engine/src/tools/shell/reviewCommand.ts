/**
 * AI 研判：用当前聊天模型对命令做短分类（allow / ask）。
 */
import { getChatModel } from "../../model/openai";

export type ReviewDecision = "allow" | "ask";

/**
 * 研判命令风险。失败 / 超时 / 无模型 → ask。
 */
export async function reviewCommand(
  command: string,
  signal: AbortSignal,
): Promise<{ decision: ReviewDecision; reason: string }> {
  let model;
  try {
    model = getChatModel();
  } catch {
    return { decision: "ask", reason: "Model not configured." };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const result = await model.chat(
      {
        messages: [
          {
            role: "system",
            content:
              'You classify shell commands for a coding agent. Reply with ONLY JSON: {"decision":"allow"|"ask","reason":"..."}. Use "allow" for clearly safe read-only or routine project commands (git status, ls, pnpm test, etc.). Use "ask" for destructive, network-exfiltrating, privilege, or unclear commands.',
          },
          {
            role: "user",
            content: command,
          },
        ],
      },
      controller.signal,
    );
    const text = (result.content ?? "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { decision: "ask", reason: "Unparseable review." };
    const parsed = JSON.parse(jsonMatch[0]) as { decision?: string; reason?: string };
    if (parsed.decision === "allow") {
      return { decision: "allow", reason: parsed.reason || "Allowed by review." };
    }
    return { decision: "ask", reason: parsed.reason || "Needs confirmation." };
  } catch {
    return { decision: "ask", reason: "Review failed." };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
