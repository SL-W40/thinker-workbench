/**
 * 文件 / 文件夹图标（基于 material-icon-theme）。
 *
 * 图标数据与映射表由 `scripts/gen-file-icons.mjs` 生成（`pnpm icons:gen`），
 * 判定逻辑在 `material/resolve.ts`：先查 material 清单，没命中再按 `glyphKind` 的族兜底。
 *
 * 两个组件都包了 memo：文件树一次同屏几百行，props 只有字符串 / 布尔，
 * 父组件（乃至整个 App）重渲染时靠 memo 挡掉绝大多数图标的重复渲染。
 */
import { memo } from "react";
import { MaterialSvg } from "./material/MaterialSvg";
import { iconMarkup } from "./material/markup";
import { resolveFileIconId, resolveFolderIconId } from "./material/resolve";
import { domIconMode, useIconMode } from "./material/themeMode";

/** 按文件名渲染 material 文件图标（React）。 */
export const FileGlyph = memo(function FileGlyph({ name }: { name: string }) {
  const mode = useIconMode();
  return <MaterialSvg id={resolveFileIconId(name, mode)} />;
});

/**
 * 按文件夹名渲染 material 文件夹图标（React）。
 * 传 `name` 才会命中 src / node_modules / .git 这类特殊文件夹图标。
 */
export const IconFolder = memo(function IconFolder({
  open,
  name,
}: {
  open?: boolean;
  name?: string;
}) {
  const mode = useIconMode();
  return <MaterialSvg id={resolveFolderIconId(name, open ?? false, mode)} />;
});

/**
 * 同一图标的 SVG 字符串版本，供纯 DOM 场景使用
 * （如 composer contentEditable 内手工构造的 mention 芯片，无法渲染 React 组件）。
 */
export function fileGlyphMarkup(name: string): string {
  return iconMarkup(resolveFileIconId(name, domIconMode()));
}
