/**
 * shell / shell_await / shell_write 工具执行体。
 */
import path from "node:path";
import { type PtyExecMode, stripAnsi } from "@thinker-workbench/shared";
import { getLimit } from "../../config/runtimeLimits";
import { requestHitl } from "../../hitl/requestHitl";
import { ptyAwait, ptyExec, ptyWrite } from "../../host/ptyClient";
import { getWorkspaceAccess, getWorkspaceRoot } from "../../workspace";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";
import { ensureShellApproved, ensureShellWriteApproved } from "./approve";
import { getShellSessionCommand, rememberShellSessionCommand } from "./sessionMeta";

/** 已落盘时回传模型的最大尾部字符（避免 ConPTY 垃圾灌爆回复）。 */
const SPILL_TAIL_CHARS = 2_000;

/** 截断输出：保留头尾。 */
function truncateOutput(text: string): string {
  const cap = getLimit("shellOutputCap");
  if (text.length <= cap) return text;
  const head = Math.floor(cap * 0.4);
  const tail = cap - head - 80;
  return `${text.slice(0, head)}\n\n...[${text.length - head - tail} bytes truncated]...\n\n${text.slice(-tail)}`;
}

/** 清洗后再截断；已 spill 时只留短尾。 */
function prepareOutputForModel(raw: string, options: { spilled?: boolean }): string {
  const cleaned = stripAnsi(raw).replace(/\r\n/g, "\n").trimEnd();
  if (options.spilled) {
    if (!cleaned) return "(full output in outputPath; inline tail empty)";
    if (cleaned.length <= SPILL_TAIL_CHARS) return cleaned;
    return `...[tail ${SPILL_TAIL_CHARS} of ${cleaned.length} chars; see outputPath]...\n${cleaned.slice(-SPILL_TAIL_CHARS)}`;
  }
  return truncateOutput(cleaned);
}

/** 解析 cwd：相对 workspace；full 才允许逃出。 */
function resolveCwd(workingDirectory: string | undefined, workspaceRoot: string): string {
  if (!workingDirectory?.trim()) return workspaceRoot;
  const raw = workingDirectory.trim();
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(workspaceRoot, raw);
  const access = getWorkspaceAccess();
  if (access !== "full") {
    const rel = path.relative(workspaceRoot, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(
        `working_directory escapes workspace (access=${access}): ${workingDirectory}`,
      );
    }
  }
  return resolved;
}

/**
 * 解析 exec_mode。
 * auto（默认）：await=false → login；其余 → direct。
 */
export function resolveShellExecMode(requested: unknown, awaitMode: boolean): PtyExecMode {
  const raw = typeof requested === "string" ? requested.trim().toLowerCase() : "auto";
  if (raw === "login" || raw === "direct") return raw;
  return awaitMode ? "direct" : "login";
}

function formatShellResult(fields: {
  sessionId: string;
  exitCode: number | null;
  outcome: string;
  wakeReason?: string;
  output: string;
  outputPath?: string;
  outputBytes?: number;
  outputTruncated?: boolean;
  execMode?: string;
}): string {
  const lines = [
    `sessionId: ${fields.sessionId}`,
    `outcome: ${fields.outcome}`,
    `exitCode: ${fields.exitCode === null ? "null" : String(fields.exitCode)}`,
  ];
  if (fields.wakeReason) lines.push(`wakeReason: ${fields.wakeReason}`);
  if (fields.execMode) lines.push(`execMode: ${fields.execMode}`);
  if (fields.outputPath) {
    lines.push(`outputPath: ${fields.outputPath}`);
    if (fields.outputBytes != null) lines.push(`outputBytes: ${fields.outputBytes}`);
    lines.push(
      "note: Full output spilled to outputPath (kept after command ends). Prefer read_file with this workspace-relative path. Inline body is a short stripped tail only.",
    );
  }
  const body = prepareOutputForModel(fields.output, {
    spilled: Boolean(fields.outputPath || fields.outputTruncated),
  });
  lines.push("", body || "(no output)");
  return lines.join("\n");
}

/** shell 工具。 */
export async function shellTool(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  const command = typeof args.command === "string" ? args.command : "";
  if (!command.trim()) throw new Error("command is required.");
  const workingDirectory =
    typeof args.working_directory === "string" ? args.working_directory : undefined;
  const awaitMode = args.await !== false && args.background !== true;
  const blockUntilMs =
    typeof args.block_until_ms === "number" && Number.isFinite(args.block_until_ms)
      ? Math.max(0, Math.floor(args.block_until_ms))
      : getLimit("defaultShellBlockUntilMs");
  const execMode = resolveShellExecMode(args.exec_mode, awaitMode);

  await ensureShellApproved(command, ctx.signal);
  const cwd = resolveCwd(workingDirectory, ctx.workspaceRoot || getWorkspaceRoot());

  const result = await ptyExec(
    {
      command,
      workingDirectory: cwd,
      blockUntilMs,
      await: awaitMode,
      execMode,
    },
    ctx.signal,
  );

  if (result.sessionId) {
    rememberShellSessionCommand(result.sessionId, command);
  }

  const ptyFailed = result.output.includes("[PTY error]");
  const backgrounded = result.outcome === "still_running";
  return {
    output: formatShellResult({
      sessionId: result.sessionId,
      exitCode: result.exitCode,
      outcome: result.outcome,
      wakeReason: result.wakeReason,
      output: result.output,
      outputPath: result.outputPath,
      outputBytes: result.outputBytes,
      outputTruncated: result.outputTruncated,
      execMode: result.execMode ?? execMode,
    }),
    ok: !ptyFailed,
    ui: {
      sessionId: result.sessionId,
      command,
      exitCode: result.exitCode,
      backgrounded,
      outcome: result.outcome,
      wakeReason: result.wakeReason,
      outputPath: result.outputPath,
      execMode: result.execMode ?? execMode,
    },
  };
}

/** shell_await 工具。 */
export async function shellAwaitTool(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  const sessionId = typeof args.sessionId === "string" ? args.sessionId.trim() : "";
  if (!sessionId) throw new Error("sessionId is required.");
  const blockUntilMs =
    typeof args.block_until_ms === "number" && Number.isFinite(args.block_until_ms)
      ? Math.max(0, Math.floor(args.block_until_ms))
      : getLimit("defaultShellBlockUntilMs");
  const pattern = typeof args.pattern === "string" ? args.pattern : undefined;

  const result = await ptyAwait({ sessionId, blockUntilMs, pattern }, ctx.signal);

  const backgrounded = result.outcome === "still_running";
  return {
    output: formatShellResult({
      sessionId: result.sessionId,
      exitCode: result.exitCode,
      outcome: result.outcome,
      wakeReason: result.wakeReason,
      output: result.output,
      outputPath: result.outputPath,
      outputBytes: result.outputBytes,
      outputTruncated: result.outputTruncated,
      execMode: result.execMode,
    }),
    ui: {
      sessionId: result.sessionId,
      exitCode: result.exitCode,
      backgrounded,
      outcome: result.outcome,
      wakeReason: result.wakeReason,
      outputPath: result.outputPath,
      execMode: result.execMode,
    },
  };
}

/**
 * 规范化 shell_write 载荷：把 ^C / ctrl+c / \\x03 等转成真实控制字符；
 * 控制字符默认不自动补 \\r。
 */
export function normalizeShellWriteData(
  data: string,
  submitRequested: boolean,
): { payload: string; submit: boolean } {
  const key = data.trim().toLowerCase();
  const controlAliases: Record<string, string> = {
    "^c": "\x03",
    "ctrl+c": "\x03",
    "ctrl-c": "\x03",
    "\\x03": "\x03",
    "<c-c>": "\x03",
    "^d": "\x04",
    "ctrl+d": "\x04",
    "ctrl-d": "\x04",
    "\\x04": "\x04",
    "^z": "\x1a",
    "ctrl+z": "\x1a",
    "ctrl-z": "\x1a",
  };
  const aliased = controlAliases[key];
  if (aliased !== undefined) {
    return { payload: aliased, submit: false };
  }
  if (data.length === 1 && data.charCodeAt(0) < 32) {
    return { payload: data, submit: false };
  }
  // 字面量 "\x03" 两字符形式已在 aliases；再处理真实 ESC 序列前缀
  if (data === "\\x03") {
    return { payload: "\x03", submit: false };
  }
  return { payload: data, submit: submitRequested };
}

function isControlOnlyPayload(payload: string): boolean {
  return payload.length === 1 && payload.charCodeAt(0) < 32;
}

/** shell_write 工具（含 secret HITL）。 */
export async function shellWriteTool(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  const sessionId = typeof args.sessionId === "string" ? args.sessionId.trim() : "";
  if (!sessionId) throw new Error("sessionId is required.");
  const secret = args.secret === true;
  const submitArg = args.submit !== false;
  const dataArg = typeof args.data === "string" ? args.data : "";

  let payload: string;
  let submit = submitArg;
  if (secret) {
    const response = await requestHitl(
      {
        kind: "shell_secret_input",
        title: "Enter secret for shell session",
        body: `Session ${sessionId} is waiting for a password or secret. It will be written to the PTY and never returned to the model.`,
        payload: { sessionId },
        actions: [
          { id: "submit", label: "Submit", style: "primary" },
          { id: "deny", label: "Cancel", style: "danger" },
        ],
      },
      ctx.signal,
    );
    if (response.actionId === "deny") {
      throw new Error("Shell secret input cancelled by user.");
    }
    const secretValue = typeof response.values?.secret === "string" ? response.values.secret : "";
    if (!secretValue) throw new Error("Empty secret.");
    payload = secretValue;
    submit = submitArg;
  } else {
    if (!dataArg) throw new Error("data is required when secret is not true.");
    const normalized = normalizeShellWriteData(dataArg, submitArg);
    payload = normalized.payload;
    submit = normalized.submit;
    // 控制字符（如 Ctrl+C）跳过写入审批，避免卡在错误卡片上
    if (!isControlOnlyPayload(payload)) {
      await ensureShellWriteApproved(sessionId, dataArg, ctx.signal, {
        parentCommand: getShellSessionCommand(sessionId),
      });
    }
  }

  const toWrite = submit ? `${payload}\r` : payload;
  await ptyWrite({ sessionId, data: toWrite }, ctx.signal);

  if (secret) {
    return {
      output: [
        `sessionId: ${sessionId}`,
        `ok: true`,
        `bytesWritten: ${Buffer.byteLength(toWrite, "utf8")}`,
        `secret: true`,
        "",
        "(secret written; plaintext omitted)",
      ].join("\n"),
      ui: { sessionId, backgrounded: true },
    };
  }

  return {
    output: [
      `sessionId: ${sessionId}`,
      `ok: true`,
      `bytesWritten: ${Buffer.byteLength(toWrite, "utf8")}`,
      "",
      "(written to PTY)",
    ].join("\n"),
    ui: { sessionId, backgrounded: true },
  };
}
