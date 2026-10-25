/**
 * material 图标的 React 渲染：按 id 取 viewBox + 结构化节点树，套一层 svg 输出。
 *
 * 节点是构建期解析好的静态数据（见 scripts/gen-file-icons.mjs），用 createElement 构建而不是
 * innerHTML 注入：后者要让浏览器对每个图标跑一遍 HTML 解析器，文件树一次挂载几百个图标时很可观。
 */
import { createElement, memo, type ReactElement } from "react";
import { iconNode, iconViewBox } from "./iconData";
import type { IconNode } from "./iconNode";

/**
 * 图标渲染尺寸（viewBox 由图标自身决定，这里只定外层大小）。
 * 16 是 material-icon-theme 的设计尺寸（与 VS Code 一致），槽位 CSS 也按 16 对齐。
 */
export const MATERIAL_ICON_SIZE = 16;

/** svg 的样式提到模块级：避免每次渲染新建对象触发 style diff。 */
const SVG_STYLE = { display: "block", flex: "0 0 auto" } as const;

/** svg 的命名空间与固定属性也提到模块级，同样是为了避免重复建对象。 */
const SVG_NS = "http://www.w3.org/2000/svg";

/** 把一个结构化节点递归构建成 React 元素。 */
function buildNode(node: IconNode): ReactElement {
  const [tag, attrs, children] = node;
  let props: Record<string, string> | undefined;
  if (attrs && attrs.length > 0) {
    props = {};
    for (let i = 0; i < attrs.length; i += 2) props[attrs[i]] = attrs[i + 1];
  }
  if (children && children.length > 0) {
    // 子节点以可变参数传入，React 不会要求 key（静态内容本来也不需要）
    return createElement(tag, props, ...children.map(buildNode));
  }
  return createElement(tag, props);
}

/**
 * 按 id 渲染一枚 material 图标；id 无对应节点时渲染空占位，保持布局不塌。
 *
 * memo：文件树一次同屏几百枚图标，父组件重渲染时靠 props（只有 id / size 两个标量）挡掉绝大多数。
 */
export const MaterialSvg = memo(function MaterialSvg({
  id,
  size = MATERIAL_ICON_SIZE,
}: {
  id: string;
  size?: number;
}) {
  const nodes = iconNode(id);
  return createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: iconViewBox(id),
      xmlns: SVG_NS,
      "aria-hidden": "true",
      style: SVG_STYLE,
    },
    ...(nodes ? nodes.map(buildNode) : []),
  );
});
