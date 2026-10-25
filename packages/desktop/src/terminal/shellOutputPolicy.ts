/**
 * 输出落盘与内存尾部裁剪（超阈值 spill）。
 */
import path from "node:path";
import { getGeneralSettings } from "../config/settingsStore";
import { getLastWorkspaceId } from "../db/workspacesStore";
import {
  appendShellSpill,
  pruneShellSpillDir,
  resolveSpillLocation,
  SHELL_MEMORY_TAIL,
  trimMemoryTail,
} from "./shellOutputFileStore";
import type { SessionRecord } from "./terminalSessionTypes";

/** spill 阈值（字符）；配置非法时回落 200K。 */
export function spillThresholdChars(): number {
  const cap = getGeneralSettings().shellOutputCap;
  return Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 200_000;
}

/**
 * 追加输出；超阈值落盘并截断内存尾部。
 * @param onChunk 广播回调（由管理器接到 dataBatcher）。
 */
export function appendOutputWithSpill(
  rec: SessionRecord,
  data: string,
  onChunk: (sessionId: string, chunk: string) => void,
): void {
  const run = rec.run;
  if (run?.spilled && run.outputFilePath) {
    appendShellSpill(run.outputFilePath, data);
  }

  rec.output += data;
  if (run) {
    run.outputBytes += Buffer.byteLength(data, "utf8");
    const threshold = spillThresholdChars();
    if (!run.spilled && rec.output.length > threshold) {
      const loc = resolveSpillLocation({
        workspaceId: getLastWorkspaceId(),
        sessionId: rec.meta.sessionId,
      });
      pruneShellSpillDir(path.dirname(loc.absolutePath), {
        excludeAbsolute: loc.absolutePath,
      });
      run.outputFilePath = loc.absolutePath;
      run.outputReportPath = loc.reportPath;
      run.spilled = true;
      appendShellSpill(loc.absolutePath, rec.output);
    }
    if (run.spilled || rec.output.length > SHELL_MEMORY_TAIL) {
      const beforeLen = rec.output.length;
      const trimmed = trimMemoryTail(rec.output, SHELL_MEMORY_TAIL);
      rec.output = trimmed.output;
      run.outputCursor = Math.max(0, run.outputCursor - (beforeLen - rec.output.length));
    }
  } else if (rec.output.length > SHELL_MEMORY_TAIL) {
    rec.output = trimMemoryTail(rec.output).output;
  }

  onChunk(rec.meta.sessionId, data);
}
