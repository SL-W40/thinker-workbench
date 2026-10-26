/**
 * Office 旧格式（.doc / .xls）解析：officeparser v8（AST + 生成器模型）。
 * v8 只认 docx/xlsx/odt/rtf/pdf 等，不再支持 .doc/.xls 这类 OLE2 二进制格式，
 * 所以这里对 OLE2 魔数直接快速失败，其余（例如 Word 存成的 RTF 内容）仍交给库解析。
 * 失败一律转成 error 返回，不抛错阻断上层。
 */

import { OfficeParser } from "officeparser";
import type { FileParser, ParsedFileResult, ParseInput } from "../types";

/** OLE2 复合文档（doc / xls / ppt）的文件头。 */
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

function isOle2(bytes: Uint8Array): boolean {
  return OLE2_MAGIC.every((b, i) => bytes[i] === b);
}

async function parseBuffer(buf: Buffer): Promise<string> {
  // 只要文本：关掉附件抽取与 OCR，省掉 tesseract worker 的加载与识别开销
  const ast = await OfficeParser.parseOffice(buf, {
    extractAttachments: false,
    ocr: false,
  });
  const { value } = await ast.to("text");
  // text 目的地恒为 string；兜一层以防生成器返回字节
  return typeof value === "string" ? value : Buffer.from(value).toString("utf8");
}

export const legacyOfficeParser: FileParser = {
  id: "legacyOffice",
  label: "Office 旧格式 (doc/xls)",
  priority: 90,
  supports(_mime, ext) {
    return ext === "doc" || ext === "xls";
  },
  async parse(input: ParseInput): Promise<ParsedFileResult> {
    // 契约：解析实现内部自管异常，返回 error 让上层降级，不抛给调用方。
    try {
      // v8 解析不了 OLE2：提前给出可读原因，免得再走一遍库的类型探测
      if (isOle2(input.bytes)) {
        return { kind: "document", error: "officeparser 不支持 OLE2 旧格式（doc/xls）" };
      }
      const text = await parseBuffer(Buffer.from(input.bytes));
      return { text, kind: "document" };
    } catch (err) {
      return { kind: "document", error: err instanceof Error ? err.message : String(err) };
    }
  },
};
