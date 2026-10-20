/**
 * Office 旧格式（.doc / .xls）解析：officeparser（回调式 API，包成 Promise）。
 * 旧格式解析能力弱于新版（docx/xlsx），失败由上层降级。
 */
import type { FileParser, ParseInput, ParsedFileResult } from "../types";
import officeparser from "officeparser";

function parseBuffer(buf: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    officeparser.parseBuffer(buf, (err: Error | null, data: unknown) => {
      if (err) return reject(err);
      resolve(typeof data === "string" ? data : JSON.stringify(data, null, 2));
    });
  });
}

export const legacyOfficeParser: FileParser = {
  id: "legacyOffice",
  label: "Office 旧格式 (doc/xls)",
  priority: 90,
  supports(mime, ext) {
    return ext === "doc" || ext === "xls";
  },
  async parse(input: ParseInput): Promise<ParsedFileResult> {
    const text = await parseBuffer(Buffer.from(input.bytes));
    return { text, kind: "document" };
  },
};
