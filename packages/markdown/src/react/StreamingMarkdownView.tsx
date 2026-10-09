/**
 * MarkdownView 便捷包装：默认按流式安全解析；
 * 传入 `streaming={false}` 可收束未闭合块（去掉 caret / STREAMING）。
 */
import { MarkdownView, type MarkdownViewProps } from "./MarkdownView";

export type StreamingMarkdownViewProps = MarkdownViewProps;

/** 默认 `streaming=true`；停止后应传 `false` 去掉光标。 */
export function StreamingMarkdownView({
  streaming = true,
  ...props
}: StreamingMarkdownViewProps) {
  return <MarkdownView {...props} streaming={streaming} />;
}
