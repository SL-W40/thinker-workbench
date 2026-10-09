/**
 * 探测本机可用 shell profile，并解析 Settings 中的 shellProfileId。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ShellProfile } from "@thinker-workbench/shared";

/** 路径存在且为文件时返回 true。 */
function isFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 在 PATH / 常见位置查找可执行文件。 */
function which(name: string): string | null {
  const pathEnv = process.env.PATH ?? process.env.Path ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)
      : [""];
  for (const dir of pathEnv.split(sep)) {
    if (!dir.trim()) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, name + (process.platform === "win32" ? ext : ""));
      if (isFile(candidate)) return candidate;
    }
    // 无扩展名再试一次（Unix / 已带 .exe 的 name）
    const plain = path.join(dir, name);
    if (isFile(plain)) return plain;
  }
  return null;
}

/** Windows 候选 profiles。 */
function detectWindows(): ShellProfile[] {
  const out: ShellProfile[] = [];
  const ps =
    which("powershell.exe") ||
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  if (isFile(ps)) {
    out.push({
      id: "powershell",
      name: "Windows PowerShell",
      path: ps,
      args: ["-NoLogo"],
    });
  }
  const pwsh = which("pwsh.exe") || which("pwsh");
  if (pwsh) {
    out.push({ id: "pwsh", name: "PowerShell 7", path: pwsh, args: ["-NoLogo"] });
  }
  const cmd =
    which("cmd.exe") || path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
  if (isFile(cmd)) {
    out.push({ id: "cmd", name: "Command Prompt", path: cmd, args: [] });
  }
  const gitBashCandidates = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Git", "bin", "bash.exe"),
  ];
  for (const p of gitBashCandidates) {
    if (isFile(p)) {
      out.push({ id: "git-bash", name: "Git Bash", path: p, args: ["-l"] });
      break;
    }
  }
  return out;
}

/** macOS / Linux 候选 profiles。 */
function detectUnix(): ShellProfile[] {
  const out: ShellProfile[] = [];
  const seen = new Set<string>();
  const add = (id: string, name: string, p: string, args: string[] = []) => {
    if (!isFile(p) || seen.has(p)) return;
    seen.add(p);
    out.push({ id, name, path: p, args });
  };
  const envShell = process.env.SHELL?.trim();
  if (envShell) {
    add("shell", path.basename(envShell), envShell, ["-l"]);
  }
  add("zsh", "zsh", "/bin/zsh", ["-l"]);
  add("bash", "bash", "/bin/bash", ["-l"]);
  add("fish", "fish", "/usr/bin/fish", ["-l"]);
  add("zsh-usr", "zsh", "/usr/bin/zsh", ["-l"]);
  add("bash-usr", "bash", "/usr/bin/bash", ["-l"]);
  return out;
}

/** 列出本机可用 shell（不含虚拟 default 条目）。 */
export function listAvailableShellProfiles(): ShellProfile[] {
  return process.platform === "win32" ? detectWindows() : detectUnix();
}

/** 平台默认 profile（Settings `default` 解析目标）。 */
export function platformDefaultShellProfile(): ShellProfile {
  const list = listAvailableShellProfiles();
  if (process.platform === "win32") {
    return (
      list.find((p) => p.id === "powershell") ||
      list[0] || {
        id: "powershell",
        name: "Windows PowerShell",
        path: "powershell.exe",
        args: ["-NoLogo"],
      }
    );
  }
  const envShell = process.env.SHELL?.trim();
  if (envShell && isFile(envShell)) {
    return {
      id: "shell",
      name: path.basename(envShell),
      path: envShell,
      args: ["-l"],
    };
  }
  return (
    list[0] || {
      id: "bash",
      name: "bash",
      path: "/bin/bash",
      args: ["-l"],
    }
  );
}

/**
 * 解析 Settings 中的 shellProfileId。
 * 无效 / 已卸载时回退平台默认。
 */
export function resolveShellProfile(shellProfileId: string | undefined | null): ShellProfile {
  const id = (shellProfileId ?? "default").trim() || "default";
  if (id === "default") return platformDefaultShellProfile();
  const found = listAvailableShellProfiles().find((p) => p.id === id);
  return found ?? platformDefaultShellProfile();
}

/** 供 environment_context：带 profile_id 展示字段。 */
export function shellFactsForAgent(shellProfileId: string | undefined | null): ShellProfile {
  const resolved = resolveShellProfile(shellProfileId);
  return {
    ...resolved,
    // 保留用户选择的 id（default 时仍用真实 profile id）
    id: (shellProfileId ?? "default").trim() === "default" ? "default" : resolved.id,
  };
}

/** 用户 home（调试用）。 */
export function homeDir(): string {
  return os.homedir();
}
