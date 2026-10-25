/**
 * 表格行顺序工具。
 *
 * 放在组件之外，是为了让「拖拽重排」这种纯数组操作能被单独复用与单测——
 * 组件层只负责手势与状态绑定，不持有这段 immersion 逻辑。
 */

/** 将 `fromIndex` 项移到 `toIndex`；越界或原地不动时返回浅拷贝，保持调用方 setState 语义稳定。 */
export function reorderTableRows<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length
  ) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  if (item === undefined) return [...list];
  next.splice(toIndex, 0, item);
  return next;
}
