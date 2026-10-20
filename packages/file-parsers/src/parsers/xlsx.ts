/**
 * Excel（.xlsx）解析：exceljs 读工作簿，逐表逐行拼成制表文本。
 */
import type { FileParser, ParseInput, ParsedFileResult } from "../types";
import ExcelJS from "exceljs";

export const xlsxParser: FileParser = {
  id: "xlsx",
  label: "Excel (xlsx)",
  priority: 100,
  supports(mime, ext) {
    return (
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      ext === "xlsx"
    );
  },
  async parse(input: ParseInput): Promise<ParsedFileResult> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(input.bytes));
    const parts: string[] = [];
    wb.eachSheet((sheet) => {
      parts.push(`# ${sheet.name}`);
      sheet.eachRow((row) => {
        const values = row.values as Array<unknown> | undefined;
        // row.values 以 1 为起始下标，第 0 项为 undefined
        const cells = (values ?? []).slice(1).map((v) => (v == null ? "" : String(v)));
        parts.push(cells.join("\t"));
      });
    });
    return { text: parts.join("\n"), kind: "document" };
  },
};
