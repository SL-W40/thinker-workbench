/**
 * Thinker 根目录与日志路径解析。
 *
 * - `settings.json` 始终落在固定引导路径 `~/.thinker/settings.json`（以便能读到 dataDir）
 * - `dataDir`：默认同级根 `~/.thinker`，其下分层见 `@thinker-workbench/shared` 的布局表
 *
 * 本模块不依赖 settingsStore，避免循环引用；调用方自行传入已配置字符串。
 */
import os from "node:os";
import path from "node:path";

/**
 * 固定引导根：`~/.thinker`（始终可读 settings.json）。
 * 仅在 Vitest 下尊重 `THINKER_HOME`，避免开发启动误读临时目录。
 */
export function bootstrapThinkerDir(): string {
  if (process.env.VITEST) {
    const override = process.env.THINKER_HOME?.trim();
    if (override) return path.resolve(override);
  }
  return path.join(os.homedir(), ".thinker");
}

/** 默认数据根：与引导根同级，即 `~/.thinker`。 */
export function defaultDataDir(): string {
  return bootstrapThinkerDir();
}

/**
 * 展开 `~` / 相对路径为绝对路径；空串返回空。
 */
export function expandUserPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed);
}

/** 解析数据根；`configured` 为空时回落 `~/.thinker`。 */
export function resolveDataDir(configured: string): string {
  return expandUserPath(configured) || defaultDataDir();
}
