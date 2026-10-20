/**
 * 设置文件路径解析：权威 `<dataDir>/settings.json` 与固定引导 `~/.thinker/settings.json`。
 */
import fs from "node:fs";
import path from "node:path";
import { isRecord } from "@thinker-workbench/shared";
import { bootstrapThinkerDir, resolveDataDir } from "../thinkerHome";
import { type DiskSettings, getCachedSettings } from "./state";

/** 引导路径上的 settings（始终可写；自定义 dataDir 时作启动镜像）。 */
export function bootstrapSettingsPath(): string {
  return path.join(bootstrapThinkerDir(), "settings.json");
}

export function samePath(a: string, b: string): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === "win32" ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/**
 * 数据根 / 权威 settings / 固定引导 settings 的绝对路径一览。
 * @param configured 省略=当前已生效；传入则按该配置串解析（可预览草稿）。
 */
export function describeDataDirPaths(configured?: string): {
  dataDir: string;
  settingsPath: string;
  bootstrapSettingsPath: string;
  sameAsBootstrap: boolean;
} {
  const current = getCachedSettings();
  const dataDir =
    configured === undefined
      ? current
        ? resolveDataDir(current.general.dataDir)
        : peekDataDirFromBootstrap()
      : resolveDataDir(typeof configured === "string" ? configured : "");
  const settings = path.join(dataDir, "settings.json");
  const bootstrap = bootstrapSettingsPath();
  return {
    dataDir,
    settingsPath: settings,
    bootstrapSettingsPath: bootstrap,
    sameAsBootstrap: samePath(settings, bootstrap),
  };
}

/** 从引导文件窥探 dataDir（加载缓存前用）。 */
export function peekDataDirFromBootstrap(): string {
  try {
    const file = bootstrapSettingsPath();
    if (!fs.existsSync(file)) return bootstrapThinkerDir();
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as DiskSettings;
    if (!isRecord(parsed)) return bootstrapThinkerDir();
    const raw =
      parsed.general && typeof parsed.general === "object"
        ? (parsed.general as { dataDir?: unknown }).dataDir
        : undefined;
    return resolveDataDir(typeof raw === "string" ? raw : "");
  } catch {
    return bootstrapThinkerDir();
  }
}

/**
 * 权威 settings.json 路径：`<dataDir>/settings.json`。
 * 默认 dataDir 时与引导路径相同。
 */
export function settingsPath(): string {
  const current = getCachedSettings();
  const dataDir = current ? resolveDataDir(current.general.dataDir) : peekDataDirFromBootstrap();
  return path.join(dataDir, "settings.json");
}
