/**
 * 图标内部片段的结构化节点。
 *
 * attrs 用扁平的 [名, 值, 名, 值] 数组而不是对象字面量，省掉重复的属性名引号与冒号。
 * children 只在 g / defs / 嵌套 svg 这类容器标签上出现。
 */
export type IconNode = readonly [
  tag: string,
  attrs?: readonly string[],
  children?: readonly IconNode[],
];
