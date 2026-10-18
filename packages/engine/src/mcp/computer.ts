/**
 * 内置 Computer MCP（Windows）：截屏 + 鼠标 / 键盘 / 滚轮控制。
 *
 * 以进程内工具形式注册进 McpManager（id: computer），不起外部 MCP 进程。
 * 输入模拟走 PowerShell（user32 SendInput 系 API + SendKeys），
 * 截图用 GDI+ CopyFromScreen 存 PNG。
 *
 * 截图落盘 `{dataDir}/computer/images/`：
 * - `ui.resultPaths` 供时间线展开缩略图；
 * - `ui.modelImages` 以 image_ref 进入模型上下文（视觉模型可见）。
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { BUILTIN_COMPUTER_MCP_ID, BUILTIN_COMPUTER_MCP_NAME } from "@thinker-workbench/shared";
import { getDataDir } from "../config/dataDir";
import type { ToolArgs, ToolResult } from "../tools/types";

/** 内置 server 的稳定 id（与 shared 常量一致）。 */
export const COMPUTER_MCP_ID = BUILTIN_COMPUTER_MCP_ID;
/** 内置 server 展示名。 */
export const COMPUTER_MCP_NAME = BUILTIN_COMPUTER_MCP_NAME;

/** PowerShell 单次调用超时。 */
const PS_TIMEOUT_MS = 20_000;
/** 截图保留数量上限（超出删最旧）。 */
const MAX_KEEP_SCREENSHOTS = 60;

/** 模型可见工具定义（轻量 JSON Schema）。 */
export type ComputerToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** SendKeys 命名键映射（小写入参 → SendKeys 令牌）。 */
const SEND_KEYS_NAMED: Record<string, string> = {
  enter: "{ENTER}",
  return: "{ENTER}",
  tab: "{TAB}",
  escape: "{ESC}",
  esc: "{ESC}",
  backspace: "{BACKSPACE}",
  delete: "{DEL}",
  del: "{DEL}",
  insert: "{INS}",
  space: " ",
  up: "{UP}",
  down: "{DOWN}",
  left: "{LEFT}",
  right: "{RIGHT}",
  home: "{HOME}",
  end: "{END}",
  pageup: "{PGUP}",
  pagedown: "{PGDN}",
  capslock: "{CAPSLOCK}",
  printscreen: "{PRTSC}",
};

/** SendKeys 需要转义的特殊字符。 */
const SEND_KEYS_SPECIAL = /[+^%~(){}[\]]/g;

/**
 * 转义 SendKeys 文本字面量（`computer_type` 用）。
 * 特殊字符包花括号后按字面发送，不被当修饰键。
 */
export function escapeSendKeysText(text: string): string {
  return text.replace(SEND_KEYS_SPECIAL, (ch) => `{${ch}}`);
}

/**
 * 把 `ctrl+c` / `alt+tab` / `f5` 之类键串翻译成 SendKeys 语法。
 * @returns null 表示无法表达（如 win 键）
 */
export function toSendKeys(combo: string): string | null {
  const parts = combo
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return null;
  let prefix = "";
  const keys: string[] = [];
  for (const part of parts) {
    if (part === "ctrl" || part === "control") {
      prefix += "^";
      continue;
    }
    if (part === "alt") {
      prefix += "%";
      continue;
    }
    if (part === "shift") {
      prefix += "+";
      continue;
    }
    if (part === "win" || part === "cmd" || part === "super") return null;
    const f = /^f([1-9]|1[0-9]|2[0-4])$/.exec(part);
    if (f) {
      keys.push(`{${part.toUpperCase()}}`);
      continue;
    }
    const named = SEND_KEYS_NAMED[part];
    if (named) {
      keys.push(named);
      continue;
    }
    if (part.length === 1) {
      keys.push(part);
      continue;
    }
    return null;
  }
  if (keys.length === 0) return null;
  return `${prefix}${keys.join("")}`;
}

/** 鼠标按钮 → mouse_event 标志。 */
function mouseFlags(button: string): { down: number; up: number } {
  switch (button) {
    case "right":
      return { down: 0x08, up: 0x10 };
    case "middle":
      return { down: 0x20, up: 0x40 };
    default:
      return { down: 0x02, up: 0x04 };
  }
}

/** 单引号 PowerShell 字符串字面量（内嵌单引号翻倍）。 */
function psQuote(raw: string): string {
  return `'${raw.replace(/'/g, "''")}'`;
}

function runPowerShell(script: string, timeoutMs = PS_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || "").trim();
          reject(new Error(detail ? `${err.message}: ${detail}` : err.message));
          return;
        }
        resolve(stdout ?? "");
      },
    );
  });
}

/** 注入 user32 输入 API 的 C# 片段（SetCursorPos / mouse_event / keybd_event）。 */
const WIN_INPUT_CS = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class TwInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
}
"@
`;

/** 虚拟桌面几何 + 光标位置（逗号分隔六元组）。 */
const SCREEN_INFO_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$vb = [System.Windows.Forms.SystemInformation]::VirtualScreen
$p = [System.Windows.Forms.Cursor]::Position
Write-Output ("{0},{1},{2},{3},{4},{5}" -f $vb.Left, $vb.Top, $vb.Width, $vb.Height, $p.X, $p.Y)
`;

/** 截图脚本：GDI+ 截虚拟桌面存 PNG，输出同 SCREEN_INFO_PS 的六元组。 */
function screenshotPs(outPath: string): string {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$vb = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $vb.Width, $vb.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
try { $g.CopyFromScreen($vb.Left, $vb.Top, 0, 0, $bmp.Size) } finally { $g.Dispose() }
$bmp.Save(${psQuote(outPath)}, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$p = [System.Windows.Forms.Cursor]::Position
Write-Output ("{0},{1},{2},{3},{4},{5}" -f $vb.Left, $vb.Top, $vb.Width, $vb.Height, $p.X, $p.Y)
`;
}

type ScreenInfo = {
  left: number;
  top: number;
  width: number;
  height: number;
  x: number;
  y: number;
};

function parseScreenInfo(stdout: string): ScreenInfo | null {
  const line = (stdout ?? "").trim().split(/\r?\n/).filter(Boolean).pop();
  if (!line) return null;
  const nums = line.split(",").map((n) => Number.parseInt(n.trim(), 10));
  if (nums.length !== 6 || nums.some((n) => !Number.isFinite(n))) return null;
  const [left, top, width, height, x, y] = nums as [number, number, number, number, number, number];
  return { left, top, width, height, x, y };
}

function screenInfoText(info: ScreenInfo): string {
  return `screen ${info.width}x${info.height} at (${info.left},${info.top}); cursor at (${info.x},${info.y})`;
}

function notWindows(): ToolResult {
  return { ok: false, output: "Computer control is only supported on Windows." };
}

function screenshotDir(): string | null {
  const dataDir = getDataDir();
  if (!dataDir) return null;
  return path.join(dataDir, "computer", "images");
}

/** 生成截图路径并清理旧文件（保留最近 MAX_KEEP_SCREENSHOTS 张）。 */
function saveScreenshotPath(): string {
  const dir = screenshotDir();
  if (!dir) throw new Error("Data directory not configured.");
  fs.mkdirSync(dir, { recursive: true });
  try {
    const files = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith("computer-") && n.endsWith(".png"))
      .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => a.t - b.t);
    const excess = files.length - MAX_KEEP_SCREENSHOTS + 1;
    for (const f of excess > 0 ? files.slice(0, excess) : []) {
      try {
        fs.unlinkSync(path.join(dir, f.n));
      } catch {
        /* best-effort */
      }
    }
  } catch {
    /* 清理失败不阻断截图 */
  }
  return path.join(dir, `computer-${Date.now()}.png`);
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Math.round(Number(value));
  }
  return null;
}

/** 内置 Computer MCP 的工具定义（喂给模型）。 */
export function computerToolDefs(): ComputerToolDef[] {
  return [
    {
      name: "computer_screenshot",
      description:
        "Capture the entire Windows desktop (all monitors) as a PNG. Returns the image plus cursor position and screen geometry. Use it to see the current screen state before acting.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "computer_screen_info",
      description:
        "Get screen geometry (virtual desktop bounds and size) and current cursor position. No image; cheap.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "computer_move_mouse",
      description: "Move the mouse cursor to absolute screen coordinates.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer", description: "Absolute X in screen pixels." },
          y: { type: "integer", description: "Absolute Y in screen pixels." },
        },
        required: ["x", "y"],
        additionalProperties: false,
      },
    },
    {
      name: "computer_click",
      description:
        "Click a mouse button at absolute coordinates (current cursor position if x/y omitted).",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer", description: "Absolute X in screen pixels." },
          y: { type: "integer", description: "Absolute Y in screen pixels." },
          button: {
            type: "string",
            enum: ["left", "right", "middle"],
            description: "Mouse button; defaults to left.",
          },
          clicks: {
            type: "integer",
            enum: [1, 2],
            description: "1 = single click, 2 = double click.",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "computer_type",
      description: "Type text at the current focus (keyboard).",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "Literal text to type." } },
        required: ["text"],
        additionalProperties: false,
      },
    },
    {
      name: "computer_key",
      description:
        "Press a key or combo, e.g. enter, tab, escape, f5, ctrl+c, alt+tab, shift+tab. The Windows key is not supported.",
      parameters: {
        type: "object",
        properties: { key: { type: "string", description: "Key or combo." } },
        required: ["key"],
        additionalProperties: false,
      },
    },
    {
      name: "computer_scroll",
      description:
        "Scroll the wheel at the current cursor position. Positive = up, negative = down.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "integer", description: "Notches; positive up, negative down." },
        },
        required: ["amount"],
        additionalProperties: false,
      },
    },
  ];
}

/** 执行一个内置 computer 工具。 */
export async function callComputerTool(
  name: string,
  args: ToolArgs,
  signal?: AbortSignal,
): Promise<ToolResult> {
  if (process.platform !== "win32") return notWindows();
  if (signal?.aborted) return { ok: false, output: "Cancelled." };
  try {
    switch (name) {
      case "computer_screen_info": {
        const stdout = await runPowerShell(SCREEN_INFO_PS);
        const info = parseScreenInfo(stdout);
        if (!info) return { ok: false, output: "failed to read screen info" };
        return { ok: true, output: screenInfoText(info) };
      }
      case "computer_screenshot":
        return await screenshot();
      case "computer_move_mouse":
        return await moveMouse(args);
      case "computer_click":
        return await click(args);
      case "computer_type":
        return await typeText(args);
      case "computer_key":
        return await pressKey(args);
      case "computer_scroll":
        return await scroll(args);
      default:
        return { ok: false, output: `Unknown computer tool: ${name}` };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, output: `computer error: ${error}` };
  }
}

async function screenshot(): Promise<ToolResult> {
  const file = saveScreenshotPath();
  const stdout = await runPowerShell(screenshotPs(file));
  const info = parseScreenInfo(stdout);
  if (!info) return { ok: false, output: `screenshot saved: ${file} (screen info unavailable)` };
  return {
    ok: true,
    output: `screenshot saved: ${file}\n${screenInfoText(info)}`,
    ui: { resultPaths: [file], resultPathKinds: ["image"], modelImages: [file] },
  };
}

async function moveMouse(args: ToolArgs): Promise<ToolResult> {
  const x = toInt(args.x);
  const y = toInt(args.y);
  if (x == null || y == null) return { ok: false, output: "x and y are required integers." };
  await runPowerShell(`${WIN_INPUT_CS}\n[TwInput]::SetCursorPos(${x}, ${y}) | Out-Null`);
  return { ok: true, output: `cursor moved to (${x},${y})` };
}

async function click(args: ToolArgs): Promise<ToolResult> {
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

async function typeText(args: ToolArgs): Promise<ToolResult> {
  const text = typeof args.text === "string" ? args.text : "";
  if (!text) return { ok: false, output: "text is required." };
  const escaped = escapeSendKeysText(text);
  await runPowerShell(`$w = New-Object -ComObject WScript.Shell\n$w.SendKeys(${psQuote(escaped)})`);
  return { ok: true, output: `typed ${text.length} chars` };
}

async function pressKey(args: ToolArgs): Promise<ToolResult> {
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

async function scroll(args: ToolArgs): Promise<ToolResult> {
  const amount = toInt(args.amount);
  if (amount == null || amount === 0) {
    return { ok: false, output: "amount must be a non-zero integer." };
  }
  const data = amount * 120;
  await runPowerShell(`${WIN_INPUT_CS}\n[TwInput]::mouse_event(0x0800, 0, 0, ${data}, 0)`);
  return { ok: true, output: `scrolled ${amount > 0 ? "up" : "down"} ${Math.abs(amount)} notches` };
}
