/**
 * 按 profile id / 可执行路径识别壳类型（default 的 id 常为 shell）。
 */
import path from "node:path";
import type { ShellProfile } from "@thinker-workbench/shared";

/** 是否为 fish（含 SHELL=/opt/homebrew/bin/fish 且 id=shell）。 */
export function isFishShell(profile: Pick<ShellProfile, "id" | "path">): boolean {
  const id = profile.id.toLowerCase();
  if (id === "fish" || id.includes("fish")) return true;
  const base = path.basename(profile.path).toLowerCase();
  return base === "fish" || base === "fish.exe";
}

/** 是否为 PowerShell / pwsh。 */
export function isPowerShell(profile: Pick<ShellProfile, "id" | "path">): boolean {
  const id = profile.id.toLowerCase();
  if (id === "powershell" || id === "pwsh" || id.includes("powershell")) return true;
  const base = path.basename(profile.path).toLowerCase();
  return base === "powershell.exe" || base === "pwsh.exe" || base === "pwsh";
}

/** 是否为 cmd.exe。 */
export function isCmdShell(profile: Pick<ShellProfile, "id" | "path">): boolean {
  const id = profile.id.toLowerCase();
  if (id === "cmd") return true;
  return path.basename(profile.path).toLowerCase() === "cmd.exe";
}
