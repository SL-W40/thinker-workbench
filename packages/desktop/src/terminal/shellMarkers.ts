/**
 * Agent login 壳结束标记：包装命令、解析 exitCode、清洗输出。
 */
import type { ShellProfile } from "@thinker-workbench/shared";
import { isCmdShell, isFishShell, isPowerShell } from "./shellKind";

/** Agent 命令结束标记（OSC，xterm 通常不显示为可见文本）。 */
export const DONE_OSC_RE = /\x1b\]666;done;(-?\d+)\x07/;
export const DONE_PLAIN_RE = /__TW_DONE__(-?\d+)/;

/** 供 RegExp 匹配结束标记。 */
export function donePatternSource(): string {
  return "(?:\\x1b\\]666;done;-?\\d+\\x07|__TW_DONE__-?\\d+)";
}

/** 从缓冲输出解析 done 标记中的退出码。 */
export function parseDoneExitCode(output: string): number | null {
  const osc = output.match(DONE_OSC_RE);
  if (osc) return Number(osc[1]);
  const plain = output.match(DONE_PLAIN_RE);
  if (plain) return Number(plain[1]);
  return null;
}

/** 是否已出现结束标记。 */
export function hasDoneMarker(output: string): boolean {
  return DONE_OSC_RE.test(output) || DONE_PLAIN_RE.test(output);
}

/** 去掉结束标记，避免进模型 / UI。 */
export function stripDoneMarkers(output: string): string {
  return output
    .replace(/\x1b\]666;done;-?\d+\x07/g, "")
    .replace(/\r?\n?__TW_DONE__-?\d*\r?\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * 在用户命令后追加结束标记：命令真正退出后才打印。
 * PowerShell / bash / fish 分别用 finally / EXIT trap / fish_exit，避免 Ctrl+C 跳过标记。
 */
export function wrapWithDoneMarker(
  profile: Pick<ShellProfile, "id" | "path"> | string,
  command: string,
): string {
  const ref =
    typeof profile === "string" ? { id: profile, path: profile } : profile;
  if (isPowerShell(ref)) {
    // try/finally：Ctrl+C 打断命令后仍打印 OSC done
    return (
      `try { ${command} } finally { ` +
      `$__twEc = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } ` +
      `elseif (-not $?) { 1 } else { 0 }; ` +
      `Write-Host ("{0}]666;done;{1}{2}" -f [char]27, $__twEc, [char]7) -NoNewline }`
    );
  }
  if (isCmdShell(ref)) {
    // cmd 无可靠 finally；仍用 & 链接，Ctrl+C 场景靠主进程 interrupt 兜底 finalize
    return `${command} & echo __TW_DONE__%ERRORLEVEL%`;
  }
  if (isFishShell(ref)) {
    // fish：fish_exit 事件在进程退出（含 SIGINT）时触发；不用 bash 式 trap
    return (
      `set -g __twEc 0; ` +
      `function __tw_done --on-event fish_exit; ` +
      `printf '\\033]666;done;%d\\007' $__twEc; ` +
      `end; ` +
      `${command}; set -g __twEc $status`
    );
  }
  // bash/zsh：EXIT trap 保证 SIGINT 后仍打标记
  return (
    `__twEc=0; ` +
    `trap 'printf "\\033]666;done;%d\\007" "$__twEc"' EXIT; ` +
    `${command}; __twEc=$?`
  );
}

/** 按 shell 拼「回车提交」整行。 */
export function submitLine(
  profile: Pick<ShellProfile, "id" | "path"> | string,
  command: string,
): string {
  const ref =
    typeof profile === "string" ? { id: profile, path: profile } : profile;
  if (isCmdShell(ref)) return `${command}\r\n`;
  return `${command}\r`;
}

/**
 * 输出尾部是否像「命令已结束回到提示符」
 * （Ctrl+C 后 OSC 偶发丢失时的兜底判据）。
 */
export function looksLikeCommandSettled(tail: string): boolean {
  if (!tail) return false;
  if (/Keyboard interrupt|Interrupted by user|^\^C/im.test(tail)) return true;
  // 常见提示符回到行首
  if (/\n(?:PS [^>\n]+>|[\w.-]+@[\w.-]+[:\$#]|[A-Z]:\\[^>]*>)\s*$/m.test(tail)) {
    return true;
  }
  return false;
}
