/**
 * Markdown 解析选项。
 */
import type { LinkDef } from "../types";

export type ParseOptions = {
  /**
   * 流式安全模式：
   * - 未闭合围栏变成带 `incomplete` 的 code/diagram 节点
   * - 未完成表格保持 incomplete（不抛错 / 不误渲染 mermaid）
   * - 未配对的行内标记在闭合前保持为纯文本
   */
  streaming?: boolean;
  /** 引用式链接定义（id 小写键）。 */
  linkDefs?: Record<string, LinkDef>;
};
