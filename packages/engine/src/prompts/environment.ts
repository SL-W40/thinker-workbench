/**
 * 每轮模型调用附带的结构化环境事实（工作区 / 时间 / 平台等）。
 * 面向模型的英文键名；本文件注释面向维护者。
 */
import os from "node:os";
import path from "node:path";
import type { AiLocale, WorkspaceAccess } from "@thinker-workbench/shared";
import {
  getAllowAiDeleteFiles,
  getAllowAiShell,
  getShellProfile,
  getWorkspaceAccess,
  getWorkspaceName,
  getWorkspaceRootOrNull,
} from "../workspace";

/** 按访问档位生成 path 策略说明。 */
function pathStyleForAccess(access: WorkspaceAccess): string {
  if (access === "workspace") {
    return "Prefer workspace-relative paths with forward slashes. Absolute paths must resolve inside workspace.root.";
  }
  if (access === "readOutside") {
    return "Prefer workspace-relative paths with forward slashes. Absolute paths outside workspace.root are allowed for read tools (read_file, list_dir, grep, search_files) only; write/edit/delete tools must stay inside the workspace.";
  }
  return "Prefer workspace-relative paths with forward slashes. Absolute paths outside workspace.root are allowed for both read and write tools.";
}

/** 档位短说明。 */
function accessDescription(access: WorkspaceAccess): string {
  if (access === "workspace") return "Sandbox: read and write only inside workspace.root.";
  if (access === "readOutside")
    return "Read-outside: absolute paths outside workspace.root allowed for reads; writes stay sandboxed.";
  return "Full: absolute paths outside workspace.root allowed for reads and writes.";
}

/** 构造环境事实对象（供序列化）。 */
export function buildEnvironmentFacts(locale: AiLocale): Record<string, unknown> {
  const now = new Date();
  const root = getWorkspaceRootOrNull();
  const name = getWorkspaceName();
  const access = getWorkspaceAccess();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const offsetMin = -now.getTimezoneOffset();
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(now);

  return {
    workspace: root
      ? {
          name: name || path.basename(root),
          root,
          root_posix: root.replace(/\\/g, "/"),
          access,
          access_description: accessDescription(access),
        }
      : {
          name: null,
          root: null,
          root_posix: null,
          access,
          access_description: accessDescription(access),
          error: "No workspace configured.",
        },
    time: {
      iso: now.toISOString(),
      local,
      timezone: tz,
      utc_offset_minutes: offsetMin,
      unix_ms: now.getTime(),
    },
    platform: {
      os: process.platform,
      arch: process.arch,
      eol: JSON.stringify(os.EOL).slice(1, -1),
      path_sep: path.sep,
      case_sensitive_fs: process.platform === "linux",
      homedir: os.homedir(),
      hostname: os.hostname(),
    },
    shell: (() => {
      const sh = getShellProfile();
      return sh
        ? {
            profile_id: sh.id,
            name: sh.name,
            path: sh.path,
            available: getAllowAiShell(),
          }
        : {
            profile_id: null,
            name: null,
            path: null,
            available: getAllowAiShell(),
          };
    })(),
    locale: {
      ai: locale,
    },
    paths: {
      tool_path_style: pathStyleForAccess(access),
      empty_path_means: "workspace root",
    },
    file_tools: {
      line_numbers: "1-based inclusive",
      read_file:
        "Optional start_line / end_line to read a slice; response lines are numbered when a range is used.",
      write_file:
        "Omit start_line/end_line to create or overwrite the whole file. Set both to replace that inclusive line span with contents (empty contents deletes the span).",
      delete_file: getAllowAiDeleteFiles()
        ? "Delete a file at path. For a directory, set recursive=true. Cannot delete workspace.root."
        : "Not available: Settings currently disallow AI file deletion.",
    },
  };
}

/**
 * 序列化为发给模型的结构化消息正文。
 * 使用 XML 围栏 + JSON，便于模型稳定识别。
 */
export function buildEnvironmentContextMessage(locale: AiLocale): string {
  const facts = buildEnvironmentFacts(locale);
  return ["<environment_context>", JSON.stringify(facts, null, 2), "</environment_context>"].join(
    "\n",
  );
}
