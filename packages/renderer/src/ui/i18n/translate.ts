/**
 * 文案目录查找与插值。
 *
 * - `MessageKey` 由英文 `MessageTree` 推导，保证 en/zh 键结构一致
 * - 当前语言缺键时回退到英文，再回退为 key 本身
 * - 支持 `{name}` 占位符（由 `vars` 替换）
 */
import type { AppLocale } from "@thinker-workbench/shared";
import { en, type MessageTree } from "./messages/en";
import { zh } from "./messages/zh";

const catalogs: Record<AppLocale, MessageTree> = { en, zh };

/** 递归把嵌套对象的叶子路径展成点分字符串联合类型。 */
type LeafPaths<T, P extends string = ""> = T extends string
  ? P
  : {
      [K in keyof T & string]: LeafPaths<T[K], P extends "" ? K : `${P}.${K}`>;
    }[keyof T & string];

/** 合法文案键（点分路径），例如 `nav.openSettings`。 */
export type MessageKey = LeafPaths<MessageTree>;

/** 按点分路径在目录树中查找字符串叶子。 */
function lookup(tree: MessageTree, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = tree;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * 按语言翻译一个 MessageKey。
 * @param vars 可选插值表，替换模板中的 `{key}`
 */
export function translate(
  locale: AppLocale,
  key: MessageKey,
  vars?: Record<string, string>,
): string {
  const raw = lookup(catalogs[locale], key) ?? lookup(en, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
}

/** 返回指定语言的完整文案树（缺省回退英文）。 */
export function getCatalog(locale: AppLocale): MessageTree {
  return catalogs[locale] ?? en;
}
