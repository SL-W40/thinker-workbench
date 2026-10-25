/**
 * 图标数据访问：id -> viewBox + 结构化节点树。
 *
 * 节点由 `scripts/gen-file-icons.mjs` 在构建期从 material-icon-theme 解析生成，是静态数据不是用户输入，
 * 所以两侧（React / DOM 字符串）都直接把它当 SVG 内容用。
 */
import {
  MATERIAL_ICON_ELEMENTS,
  MATERIAL_ICON_VIEWBOX_DEFAULT,
  MATERIAL_ICON_VIEWBOXES,
} from "./generated/bodies";
import type { IconNode } from "./iconNode";

/** 图标是否存在（文件夹展开态靠这个判断有没有对应的 `-open` 图标）。 */
export function hasIcon(id: string): boolean {
  return MATERIAL_ICON_ELEMENTS[id] !== undefined;
}

/** 图标的结构化节点树；id 不存在时返回 undefined，由调用方兜底。 */
export function iconNode(id: string): readonly IconNode[] | undefined {
  return MATERIAL_ICON_ELEMENTS[id];
}

/** 图标的 viewBox：多数图标共用默认值，少数在覆盖表里。 */
export function iconViewBox(id: string): string {
  return MATERIAL_ICON_VIEWBOXES[id] ?? MATERIAL_ICON_VIEWBOX_DEFAULT;
}
