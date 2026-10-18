import type { ChatMessage } from "../../model/types";

export type CompactionLayer = "micro" | "session" | "full";

export interface CompactResult {
  /** 压缩后的新消息数组（不可变，原数组未被修改）。 */
  messages: ChatMessage[];
  layer: CompactionLayer;
  /** 压缩前消息数。 */
  before: number;
  /** 压缩后消息数。 */
  after: number;
  /** 被移除/替换的消息数。 */
  truncated: number;
}
