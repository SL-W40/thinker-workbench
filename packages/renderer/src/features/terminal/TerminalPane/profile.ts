/**
 * Terminal 面板纯函数（默认 shell 解析）。
 */
import type { ShellProfile } from "@thinker-workbench/shared";

/** 解析 Settings 默认壳；`default` 时与主进程平台默认启发式一致。*/
export function resolveDefaultProfile(
  profiles: ShellProfile[],
  shellProfileId: string | undefined,
): ShellProfile | null {
  if (profiles.length === 0) return null;
  const fallback = profiles[0];
  if (!fallback) return null;
  const id = (shellProfileId ?? "default").trim() || "default";
  if (id !== "default") {
    return profiles.find((p) => p.id === id) ?? fallback;
  }
  return (
    profiles.find((p) => p.id === "powershell") ||
    profiles.find((p) => p.id === "shell") ||
    fallback
  );
}
