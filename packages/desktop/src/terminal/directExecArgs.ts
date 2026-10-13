/**
 * direct 模式：按 shell profile 拼非交互 argv（不依赖 OSC）。
 */
import type { ShellProfile } from "@thinker-workbench/shared";
import { isCmdShell, isFishShell, isPowerShell } from "./shellKind";

export type DirectExecInvocation = {
  file: string;
  args: string[];
};

/**
 * 把「一条命令」映射为子进程 argv。
 * - powershell / pwsh → -NoProfile -Command
 * - cmd → /d /s /c
 * - fish → -c（不用 -lc；fish 对合并 flag 不标准）
 * - 其余（bash/zsh/git-bash/…）→ -lc
 */
export function buildDirectExecArgs(
  profile: ShellProfile,
  command: string,
): DirectExecInvocation {
  if (isPowerShell(profile)) {
    return {
      file: profile.path,
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
    };
  }
  if (isCmdShell(profile)) {
    return {
      file: profile.path,
      args: ["/d", "/s", "/c", command],
    };
  }
  if (isFishShell(profile)) {
    // fish：分开放 -c；direct 不强制 login（login 模式走交互 -l）
    return {
      file: profile.path,
      args: ["-c", command],
    };
  }
  // bash / zsh / git-bash / 默认 login 壳
  return {
    file: profile.path,
    args: ["-lc", command],
  };
}

/**
 * 解析工具侧 exec_mode。
 * auto：await:false → login；其余 → direct。
 */
export function resolveExecMode(
  requested: "login" | "direct" | "auto" | undefined,
  awaitMode: boolean,
): "login" | "direct" {
  if (requested === "login" || requested === "direct") return requested;
  // auto 或缺省
  return awaitMode ? "direct" : "login";
}
