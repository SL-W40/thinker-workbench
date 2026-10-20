/**
 * PowerShell 调用与屏幕几何 / 截图脚本（Windows 专用）。
 */
import { execFile } from "node:child_process";

/** PowerShell 单次调用超时。 */
const PS_TIMEOUT_MS = 20_000;

/** 单引号 PowerShell 字符串字面量（内嵌单引号翻倍）。 */
export function psQuote(raw: string): string {
  return `'${raw.replace(/'/g, "''")}'`;
}

export function runPowerShell(script: string, timeoutMs = PS_TIMEOUT_MS): Promise<string> {
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
export const WIN_INPUT_CS = `
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
export const SCREEN_INFO_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$vb = [System.Windows.Forms.SystemInformation]::VirtualScreen
$p = [System.Windows.Forms.Cursor]::Position
Write-Output ("{0},{1},{2},{3},{4},{5}" -f $vb.Left, $vb.Top, $vb.Width, $vb.Height, $p.X, $p.Y)
`;

/** 截图脚本：GDI+ 截虚拟桌面存 PNG，输出同 SCREEN_INFO_PS 的六元组。 */
export function screenshotPs(outPath: string): string {
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

export type ScreenInfo = {
  left: number;
  top: number;
  width: number;
  height: number;
  x: number;
  y: number;
};

export function parseScreenInfo(stdout: string): ScreenInfo | null {
  const line = (stdout ?? "").trim().split(/\r?\n/).filter(Boolean).pop();
  if (!line) return null;
  const nums = line.split(",").map((n) => Number.parseInt(n.trim(), 10));
  if (nums.length !== 6 || nums.some((n) => !Number.isFinite(n))) return null;
  const [left, top, width, height, x, y] = nums as [number, number, number, number, number, number];
  return { left, top, width, height, x, y };
}

export function screenInfoText(info: ScreenInfo): string {
  return `screen ${info.width}x${info.height} at (${info.left},${info.top}); cursor at (${info.x},${info.y})`;
}
