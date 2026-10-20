/**
 * 解析层统一出口：导入即注册全部内置 parser，供 desktop / engine 直接 `parseFile`。
 * 新增格式：在 `parsers/` 实现一个 `FileParser`，在此 import 并 `registerFileParser` 即可。
 */
import { docxParser } from "./parsers/docx";
import { legacyOfficeParser } from "./parsers/legacyOffice";
import { pdfParser } from "./parsers/pdf";
import { textParser } from "./parsers/text";
import { xlsxParser } from "./parsers/xlsx";
import { registerFileParser } from "./registry";

registerFileParser(textParser);
registerFileParser(pdfParser);
registerFileParser(docxParser);
registerFileParser(xlsxParser);
registerFileParser(legacyOfficeParser);

export type { FileParser, ParseInput, ParsedFileResult } from "./types";
export { registerFileParser, getFileParser, parseFile } from "./registry";
export { extOf } from "./types";
