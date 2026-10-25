/**
 * 行内文本节点：解码实体并把相邻文本合并成单个节点，避免渲染时碎片化。
 */
import type { InlineNode } from "../../types";
import { decodeEntities } from "../entities";

export function pushText(nodes: InlineNode[], value: string): void {
  if (!value) return;
  const decoded = decodeEntities(value);
  const prev = nodes[nodes.length - 1];
  if (prev?.type === "text") prev.value += decoded;
  else nodes.push({ type: "text", value: decoded });
}
