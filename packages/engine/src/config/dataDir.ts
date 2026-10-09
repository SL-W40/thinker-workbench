/**
 * 应用数据根路径（rules / skills 全局目录）。
 * 由 desktop 经 hello / run / resume / contextUsage 注入。
 */
let currentDataDir: string | null = null;

/** 设置数据根；空值清空。 */
export function setDataDir(dir: string | undefined | null): void {
  const trimmed = dir?.trim();
  currentDataDir = trimmed || null;
}

/** 当前数据根；未配置时 null。 */
export function getDataDir(): string | null {
  return currentDataDir;
}
