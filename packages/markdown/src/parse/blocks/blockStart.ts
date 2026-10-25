/**
 * 「新块是否在此开始」的判定集合：段落 continuation 靠它收束，引用块解析也复用。
 */
import { indentOf, isThematicBreak, matchFenceOpen } from "./common";
import { matchAtx, setextLevel } from "./heading";
import { matchListMarker } from "./list";
import { isPipeTableLine, isTableHeaderAt } from "./table";

export function isDefinitionStart(lines: string[], i: number): boolean {
  if (i + 1 >= lines.length || indentOf(lines[i] ?? "") !== 0) return false;
  if (!/^:[ \t]+\S/.test(lines[i + 1] ?? "")) return false;
  const term = (lines[i] ?? "").trim();
  if (!term || /[:：]\s*$/.test(term)) return false;
  if (
    matchAtx(lines[i] ?? "") ||
    matchFenceOpen(lines[i] ?? "") ||
    isThematicBreak(lines[i] ?? "")
  ) {
    return false;
  }
  if (matchListMarker(lines[i] ?? "") || /^ {0,3}>/.test(lines[i] ?? "")) return false;
  return true;
}

export function isBlockStart(
  line: string,
  streaming: boolean,
  lines: string[],
  i: number,
): boolean {
  if (!line.trim()) return true;
  if (matchAtx(line) || matchFenceOpen(line) || /^ {0,3}>/.test(line)) return true;
  if (matchListMarker(line) && indentOf(line) <= 3) return true;
  if (isThematicBreak(line) || setextLevel(line) !== null) return true;
  if (isTableHeaderAt(lines, i)) return true;
  if (streaming && isPipeTableLine(line) && !isTableHeaderAt(lines, i)) return true;
  if (indentOf(line) <= 3 && line.trim().startsWith("$$")) return true;
  if (indentOf(line) >= 4) return true;
  if (isDefinitionStart(lines, i)) return true;
  return false;
}
