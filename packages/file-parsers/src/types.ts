/**
 * 可插拔文件解析层的核心契约。
 *
 * 设计目标：未来新增任意文件类型（zip、csv、云端文档…）的解析，
 * 只需在 `parsers/` 实现一个 `FileParser` 并在 `index.ts` 调一次
 * `registerFileParser`，预览管线（renderer）与 AI 上下文管线（engine）
 * 都无需改动 —— 它们只依赖 `parseFile` / `getFileParser`。
 */

/** 解析输入：文件字节 + 提示性的 MIME / 文件名。 */
export type ParseInput = {
  bytes: Uint8Array;
  mime?: string | null;
  name?: string;
};

/** 单个 parser 的产出。 */
export type ParsedFileResult = {
  /** 抽取出的纯文本（文档/文本），用于预览与 AI 上下文。无则省略。 */
  text?: string;
  /**
   * 该 parser 判定的语义种类，可覆盖上层 kind 推断：
   * - document：结构化文档（pdf/doc/docx/xls…）
   * - text：纯文本 / 代码
   * - other：未识别，上层仅展示文件信息
   */
  kind?: "document" | "text" | "other";
  /** 解析失败/不支持时的说明；上层据此降级为「无法解析」，不抛错阻断。 */
  error?: string;
};

/** 一个文件解析器。 */
export interface FileParser {
  /** 唯一 id（如 "pdf"）。 */
  id: string;
  /** 人类可读标签。 */
  label: string;
  /**
   * 优先级，越大越优先。同格式被多个 parser 命中时取 priority 最高者。
   * 内置解析器用 90~100，兜底 text 用 0。
   */
  priority: number;
  /** 是否认领该 MIME / 扩展名。 */
  supports(mime: string, ext: string): boolean;
  /** 解析实现；内部自管异常，返回 `error` 而非抛出。 */
  parse(input: ParseInput): Promise<ParsedFileResult>;
}

/** 从文件名取小写扩展名（不含点）；无扩展名返回空串。 */
export function extOf(name?: string): string {
  if (!name) return "";
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
