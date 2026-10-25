/**
 * material 图标的 DOM 字符串版本，与 MaterialSvg 同源。
 *
 * 用于 composer 内手工拼的 mention 芯片（contentEditable 里没法渲染 React 组件）。
 * 注意：字符串是一次性写进 DOM 的，切换主题后旧芯片不会重绘，新插入的才生效。
 */
import { iconNode, iconViewBox } from "./iconData";
import type { IconNode } from "./iconNode";
import { MATERIAL_ICON_SIZE } from "./MaterialSvg";

const SVG_NS = "http://www.w3.org/2000/svg";

/** 属性值转义：片段是静态数据，但写进 innerHTML 前仍按 XML 规则兜一层。 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function serializeNode(node: IconNode): string {
  const [tag, attrs, children] = node;
  let out = `<${tag}`;
  if (attrs) {
    for (let i = 0; i < attrs.length; i += 2) {
      out += ` ${attrs[i]}="${escapeAttr(attrs[i + 1])}"`;
    }
  }
  if (children && children.length > 0) {
    out += ">";
    for (const child of children) out += serializeNode(child);
    out += `</${tag}>`;
    return out;
  }
  return `${out}/>`;
}

/** 按 id 拼一段完整的 svg 字符串；id 无对应节点时返回空 svg 占位。 */
export function iconMarkup(id: string, size = MATERIAL_ICON_SIZE): string {
  const nodes = iconNode(id);
  let body = "";
  if (nodes) {
    for (const node of nodes) body += serializeNode(node);
  }
  return `<svg width="${size}" height="${size}" viewBox="${iconViewBox(id)}" xmlns="${SVG_NS}" aria-hidden="true">${body}</svg>`;
}
