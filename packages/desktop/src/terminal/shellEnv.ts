/**
 * PTY / direct 子进程环境：补齐 GUI 启动时偏瘦的 PATH（尤其 macOS Homebrew）。
 */
import fs from "node:fs";

/** macOS / Linux 上常见但 Dock 启动时常缺失的目录。 */
const UNIX_EXTRA_PATH_DIRS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
];

/**
 * 把存在的 Homebrew /usr/local 路径插到 PATH 前面（已有则不重复）。
 * Windows 原样返回。
 */
export function augmentPathEnv(pathEnv: string | undefined): string {
  const raw = pathEnv ?? "";
  if (process.platform === "win32") return raw;
  const sep = ":";
  const parts = raw.split(sep).filter((p) => p.trim().length > 0);
  const seen = new Set(parts);
  const prepend: string[] = [];
  for (const dir of UNIX_EXTRA_PATH_DIRS) {
    if (seen.has(dir)) continue;
    try {
      if (!fs.existsSync(dir)) continue;
    } catch {
      continue;
    }
    prepend.push(dir);
    seen.add(dir);
  }
  return prepend.length === 0 ? raw : [...prepend, ...parts].join(sep);
}

/**
 * 构造 spawn 用 env：继承 process.env，补 PATH，并合并额外变量。
 */
export function buildPtyEnv(extra?: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") env[k] = v;
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (typeof v === "string") env[k] = v;
    }
  }
  const pathKey = process.platform === "win32" && env.Path && !env.PATH ? "Path" : "PATH";
  env[pathKey] = augmentPathEnv(env[pathKey] ?? env.PATH ?? env.Path);
  return env;
}
