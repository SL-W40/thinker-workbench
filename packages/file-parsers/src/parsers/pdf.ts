/**
 * PDF 解析：pdf-parse（纯 JS，底层 pdfjs）。
 * 动态 import 以兼容其 CJS 互操作形态（default 即解析函数）。
 */
import type { FileParser, ParseInput, ParsedFileResult } from "../types";

type PdfParseFn = (data: Uint8Array) => Promise<{ text?: string }>;

async function loadPdfParse(): Promise<PdfParseFn> {
  const mod = (await import("pdf-parse")) as unknown as Record<string, unknown>;
  const fn = (mod.default ?? mod) as PdfParseFn;
  return fn;
}

export const pdfParser: FileParser = {
  id: "pdf",
  label: "PDF",
  priority: 100,
  supports(mime, ext) {
    return mime === "application/pdf" || ext === "pdf";
  },
  async parse(input: ParseInput): Promise<ParsedFileResult> {
    const parse = await loadPdfParse();
    const data = await parse(input.bytes);
    return { text: data?.text ?? "", kind: "document" };
  },
};
