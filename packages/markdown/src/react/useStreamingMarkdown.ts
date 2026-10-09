/**
 * Token 流友好的解析 hook：传入迄今完整缓冲，返回解析元数据。
 */
import { useMemo, useRef } from "react";
import { parseMarkdownDocument } from "../parse/blocks";
import { parseMarkdownStreaming, type StreamingParseResult } from "../stream";

export type UseStreamingMarkdownOptions = {
  /** 为 false 时按成品文档解析（默认 true）。 */
  streaming?: boolean;
};

/**
 * 面向累积式 token 流的辅助 hook。
 * 传入迄今完整缓冲；返回供 UI 外壳（转圈等）使用的解析元数据。
 */
export function useStreamingMarkdown(
  markdown: string,
  options: UseStreamingMarkdownOptions = {},
): StreamingParseResult & { revision: number } {
  const streaming = options.streaming !== false;
  const revisionRef = useRef(0);

  return useMemo(() => {
    revisionRef.current += 1;
    if (streaming) {
      return { ...parseMarkdownStreaming(markdown), revision: revisionRef.current };
    }
    const doc = parseMarkdownDocument(markdown);
    return {
      blocks: doc.blocks,
      footnotes: doc.footnotes,
      linkDefs: doc.linkDefs,
      incomplete: false,
      open: null as StreamingParseResult["open"],
      revision: revisionRef.current,
    };
  }, [markdown, streaming]);
}
