/**
 * 始终开启流式安全渲染的 MarkdownView 便捷包装。
 */
import { MarkdownView, type MarkdownViewProps } from "./MarkdownView";

export type StreamingMarkdownViewProps = Omit<MarkdownViewProps, "streaming">;

/** 便捷包装：始终启用流式安全渲染。 */
export function StreamingMarkdownView(props: StreamingMarkdownViewProps) {
  return <MarkdownView {...props} streaming />;
}
