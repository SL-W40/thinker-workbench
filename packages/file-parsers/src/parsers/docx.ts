/**
 * Word（.docx）解析：mammoth 抽取纯文本。
 */
import type { FileParser, ParseInput, ParsedFileResult } from "../types";
import mammoth from "mammoth";

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
    const result = await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) });
    return { text: result.value, kind: "document" };
  },
};
