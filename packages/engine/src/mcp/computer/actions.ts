/**
 * 鼠标 / 键盘 / 滚轮动作（经 PowerShell 注入 user32 与 SendKeys）。
 */
import type { ToolArgs, ToolResult } from "../../tools/types";
import { psQuote, runPowerShell, WIN_INPUT_CS } from "./powershell";
import { escapeSendKeysText, toSendKeys } from "./sendKeys";

export function notWindows(): ToolResult {
  return { ok: false, output: "Computer control is only supported on Windows." };
}

/** 鼠标按钮 → mouse_event 标志。 */
export function mouseFlags(button: string): { down: number; up: number } {
  switch (button) {
    case "right":
      return { down: 0x08, up: 0x10 };
    case "middle":
      return { down: 0x20, up: 0x40 };
    default:
      return { down: 0x02, up: 0x04 };
  }
}

export function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Math.round(Number(value));
  }
  return null;
}

export async function moveMouse(args: ToolArgs): Promise<ToolResult> {
  const x = toInt(args.x);
  const y = toInt(args.y);
  if (x == null || y == null) return { ok: false, output: "x and y are required integers." };
  await runPowerShell(`${WIN_INPUT_CS}\n[TwInput]::SetCursorPos(${x}, ${y}) | Out-Null`);
  return { ok: true, output: `cursor moved to (${x},${y})` };
}

export async function click(args: ToolArgs): Promise<ToolResult> {
  const button = typeof args.button === "string" ? args.button : "left";
  if (!["left", "right", "middle"].includes(button)) {
    return { ok: false, output: `unsupported button: ${button}` };
  }
  const clicks = toInt(args.clicks) ?? 1;
  if (clicks !== 1 && clicks !== 2) return { ok: false, output: "clicks must be 1 or 2." };
  const x = toInt(args.x);
  const y = toInt(args.y);
  if ((x == null) !== (y == null)) {
    return { ok: false, output: "x and y must be provided together." };
  }
  const flags = mouseFlags(button);
  const move = x != null && y != null ? `\n[TwInput]::SetCursorPos(${x}, ${y})` : "";
  const script = `${WIN_INPUT_CS}${move}
for ($i = 0; $i -lt ${clicks}; $i++) {
  [TwInput]::mouse_event(${flags.down}, 0, 0, 0, 0)
  Start-Sleep -Milliseconds 20
  [TwInput]::mouse_event(${flags.up}, 0, 0, 0, 0)
}`;
  await runPowerShell(script);
  const at = x != null && y != null ? ` at (${x},${y})` : "";
  return { ok: true, output: `${button} click x${clicks}${at}` };
}

export async function typeText(args: ToolArgs): Promise<ToolResult> {
  const text = typeof args.text === "string" ? args.text : "";
  if (!text) return { ok: false, output: "text is required." };
  const escaped = escapeSendKeysText(text);
  await runPowerShell(`$w = New-Object -ComObject WScript.Shell\n$w.SendKeys(${psQuote(escaped)})`);
  return { ok: true, output: `typed ${text.length} chars` };
}

export async function pressKey(args: ToolArgs): Promise<ToolResult> {
  const raw = typeof args.key === "string" ? args.key.trim() : "";
  if (!raw) return { ok: false, output: "key is required." };
  const keys = toSendKeys(raw);
  if (!keys) {
    return {
      ok: false,
      output: `unsupported key combo: ${raw} (the Windows key cannot be sent)`,
    };
  }
  await runPowerShell(`$w = New-Object -ComObject WScript.Shell\n$w.SendKeys(${psQuote(keys)})`);
  return { ok: true, output: `key sent: ${raw}` };
}

export async function scroll(args: ToolArgs): Promise<ToolResult> {
  const amount = toInt(args.amount);
  if (amount == null || amount === 0) {
    return { ok: false, output: "amount must be a non-zero integer." };
  }
  const data = amount * 120;
  await runPowerShell(`${WIN_INPUT_CS}\n[TwInput]::mouse_event(0x0800, 0, 0, ${data}, 0)`);
  return { ok: true, output: `scrolled ${amount > 0 ? "up" : "down"} ${Math.abs(amount)} notches` };
}
