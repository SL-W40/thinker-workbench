/**
 * 解析器注册表：按 (mime, ext) 选 priority 最高且 `supports` 的 parser。
 */
import type { FileParser, ParseInput, ParsedFileResult } from "./types";
import { extOf } from "./types";

const registry: FileParser[] = [];

/** 注册一个解析器（幂等追加；同 id 重复注册按多次处理，调用方应保证唯一）。 */
export function registerFileParser(p: FileParser): void {
  registry.push(p);
  // 保持 priority 降序，便于 getFileParser 取首个命中即最高优先级。
  registry.sort((a, b) => b.priority - a.priority);
}

/** 按 MIME / 文件名选中最合适的解析器；无命中返回 null。 */
export function getFileParser(mime?: string | null, name?: string): FileParser | null {
  const ext = extOf(name);
  const m = (mime ?? "").toLowerCase();
  for (const p of registry) {
    if (p.supports(m, ext)) return p;
  }
  return null;
}

/** 统一入口：命中 parser 则解析，未命中返回 `{ kind: "other" }`，异常降级为 `error`。 */
export async function parseFile(input: ParseInput): Promise<ParsedFileResult> {
  const parser = getFileParser(input.mime, input.name);
  if (!parser) return { kind: "other" };
  try {
    return await parser.parse(input);
  } catch (err) {
    return { kind: "other", error: err instanceof Error ? err.message : String(err) };
  }
}
