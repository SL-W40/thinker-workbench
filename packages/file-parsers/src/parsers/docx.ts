/**
 * Word（.docx）解析：mammoth 抽取纯文本。
 */

import mammoth from "mammoth";
import type { FileParser, ParsedFileResult, ParseInput } from "../types";

export const docxParser: FileParser = {
  id: "docx",
  label: "Word (docx)",
  priority: 100,
  supports(mime, ext) {
    return (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    );
  },
  async parse(input: ParseInput): Promise<ParsedFileResult> {
    // 契约：解析实现内部自管异常，返回 error 让上层降级，不抛给调用方。
    try {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) });
      return { text: result.value, kind: "document" };
    } catch (err) {
      return { kind: "document", error: err instanceof Error ? err.message : String(err) };
    }
  },
};
