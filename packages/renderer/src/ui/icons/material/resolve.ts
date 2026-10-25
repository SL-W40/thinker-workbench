/**
 * 路径 / 文件名 -> material 图标 id。
 *
 * 文件：整文件名表 → 扩展名（从右最长匹配，覆盖 d.ts / min.js / tar.gz 这类复合扩展）→ 自有族兜底 → 通用文件图标。
 * 文件夹：特殊文件夹名 → 通用文件夹图标，展开态取对应的 `-open` 图标。
 */
import { glyphKind } from "../glyphTables";
import {
  MATERIAL_FILE_DEFAULT,
  MATERIAL_FILE_EXTENSIONS,
  MATERIAL_FILE_NAMES,
  MATERIAL_FOLDER,
  MATERIAL_FOLDER_NAMES,
  MATERIAL_FOLDER_OPEN,
  MATERIAL_KIND_FALLBACK,
  MATERIAL_LIGHT_FILE_EXTENSIONS,
  MATERIAL_LIGHT_FILE_NAMES,
  MATERIAL_LIGHT_FOLDER_NAMES,
} from "./generated/tables";
import { hasIcon } from "./iconData";
import type { IconThemeMode } from "./themeMode";

/** 图标 id 记忆化上限：文件树可能有成百上千个名字，超过就整体清空重来。 */
const CACHE_LIMIT = 4096;

const fileCache = new Map<string, string>();
const folderCache = new Map<string, string>();

/** 取路径最后一段并归一化成小写：兼容 Windows 分隔符，并吃掉尾部的分隔符。 */
function baseName(name: string): string {
  const trimmed = name.replace(/\\/g, "/").replace(/\/+$/, "");
  return (trimmed.split("/").pop() ?? trimmed).toLowerCase();
}

function remember(cache: Map<string, string>, key: string, id: string): string {
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, id);
  return id;
}

/** 亮色主题用 `_light` 变体，覆盖表里没有的沿用暗色图标。 */
function lightOverride(
  lightTable: Record<string, string>,
  id: string,
  key: string,
  mode: IconThemeMode,
): string {
  return mode === "light" ? (lightTable[key] ?? id) : id;
}

/**
 * 扩展名从右往左最长匹配，最多取 3 段（覆盖 `d.ts`、`js.map`、`tar.gz`）。
 * 返回命中的图标 id，没命中返回 undefined。
 */
function matchExtension(base: string, mode: IconThemeMode): string | undefined {
  const parts = base.split(".");
  if (parts.length < 2) return undefined;
  const maxSegments = Math.min(3, parts.length - 1);
  for (let segments = maxSegments; segments >= 1; segments--) {
    const key = parts.slice(parts.length - segments).join(".");
    const id = MATERIAL_FILE_EXTENSIONS[key];
    if (id) return lightOverride(MATERIAL_LIGHT_FILE_EXTENSIONS, id, key, mode);
  }
  return undefined;
}

/** 文件夹名的候选键：上游把 .x / _x_ / __x__ / -x 等装饰别名折叠掉了，这里按同一规则反查。 */
function folderCandidates(base: string): string[] {
  const out = [base];
  const push = (value: string) => {
    if (value && value !== base && !out.includes(value)) out.push(value);
  };
  push(base.replace(/^\.+/, ""));
  push(base.replace(/^__/, "").replace(/__$/, ""));
  push(base.replace(/^_+/, "").replace(/_+$/, ""));
  push(base.replace(/^-+/, ""));
  return out;
}

/** 文件图标 id。 */
export function resolveFileIconId(name: string, mode: IconThemeMode): string {
  const base = baseName(name);
  const key = `${mode}\u0000${base}`;
  const cached = fileCache.get(key);
  if (cached) return cached;

  const byName = MATERIAL_FILE_NAMES[base];
  if (byName)
    return remember(fileCache, key, lightOverride(MATERIAL_LIGHT_FILE_NAMES, byName, base, mode));

  const byExt = matchExtension(base, mode);
  if (byExt) return remember(fileCache, key, byExt);

  // 清单没覆盖时按自有族选一枚 material 图标（.env*、锁文件、私钥等）。
  const fallback = MATERIAL_KIND_FALLBACK[glyphKind(base)] ?? MATERIAL_FILE_DEFAULT;
  return remember(fileCache, key, fallback);
}

/**
 * 文件夹图标 id。
 * `name` 为空（调用方拿不到文件夹名）时退到通用文件夹图标。
 */
export function resolveFolderIconId(
  name: string | undefined,
  open: boolean,
  mode: IconThemeMode,
): string {
  const base = name ? baseName(name) : "";
  const key = `${mode}\u0000${open ? "1" : "0"}\u0000${base}`;
  const cached = folderCache.get(key);
  if (cached) return cached;

  let id = MATERIAL_FOLDER;
  if (base) {
    for (const candidate of folderCandidates(base)) {
      const hit = MATERIAL_FOLDER_NAMES[candidate];
      if (hit) {
        id = lightOverride(MATERIAL_LIGHT_FOLDER_NAMES, hit, candidate, mode);
        break;
      }
    }
  }
  if (!open) return remember(folderCache, key, id);

  // 展开态是「折叠 id + -open」；个别文件夹没有对应展开图标时退到通用展开图标。
  const openId = `${id}-open`;
  return remember(folderCache, key, hasIcon(openId) ? openId : MATERIAL_FOLDER_OPEN);
}
