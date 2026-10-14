/**
 * 路径猜错时的候选：按 basename 在工作区扫命中并按后缀重合排序。
 */
import path from "node:path";
import { toWorkspaceRelative } from "./paths";
import { throwIfAborted, walkFiles } from "./walk";

/** 最多收集多少个同名命中再排序截断。 */
const MAX_COLLECT = 40;
/** 错误文案里最多展示几条。 */
const MAX_SUGGEST = 5;

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** win32 下 basename 比较忽略大小写。 */
function basenameEquals(a: string, b: string): boolean {
  if (process.platform === "win32") {
    return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
  }
  return a === b;
}

/**
 * 请求路径与候选共享的尾部段数越多分越高（如 src/parse/blocks.ts
 * 更贴近 …/src/parse/blocks.ts）；同分偏好更短路径。
 */
export function scorePathSuggestion(requestedRel: string, candidateRel: string): number {
  const req = normalizeRel(requestedRel);
  const cand = normalizeRel(candidateRel);
  const reqParts = req.split("/").filter(Boolean);
  const candParts = cand.split("/").filter(Boolean);
  if (reqParts.length === 0 || candParts.length === 0) return -1;

  let shared = 0;
  while (
    shared < reqParts.length &&
    shared < candParts.length &&
    basenameEquals(
      reqParts[reqParts.length - 1 - shared]!,
      candParts[candParts.length - 1 - shared]!,
    )
  ) {
    shared++;
  }
  if (shared === 0) return -1;
  return shared * 1000 - candParts.length;
}

/**
 * 在 workspaceRoot 下找与 basename 同名的文件，按与 requestedRel 的相似度排序。
 */
export async function suggestPathsByBasename(options: {
  workspaceRoot: string;
  /** 用户传入的路径（用于排序与展示）。 */
  requestedRel: string;
  basename: string;
  signal: AbortSignal;
  limit?: number;
}): Promise<string[]> {
  const base = options.basename.trim();
  if (!base || base === "." || base === "..") return [];

  const limit = options.limit ?? MAX_SUGGEST;
  const hits: string[] = [];

  for await (const file of walkFiles(options.workspaceRoot, options.signal)) {
    throwIfAborted(options.signal, "Suggest paths");
    if (!basenameEquals(path.basename(file), base)) continue;
    hits.push(toWorkspaceRelative(options.workspaceRoot, file));
    if (hits.length >= MAX_COLLECT) break;
  }

  hits.sort((a, b) => {
    const sa = scorePathSuggestion(options.requestedRel, a);
    const sb = scorePathSuggestion(options.requestedRel, b);
    if (sb !== sa) return sb - sa;
    return a.localeCompare(b);
  });

  return hits.slice(0, limit);
}

/** 组装「文件不存在 + 候选」错误文案（面向模型，英文）。 */
export function formatMissingFileError(pathLabel: string, suggestions: string[]): string {
  if (suggestions.length === 0) {
    return `File not found: ${pathLabel}. Use search_files or grep to locate the path; do not guess.`;
  }
  const lines = suggestions.map((s) => `- ${s}`).join("\n");
  return [
    `File not found: ${pathLabel}`,
    `Did you mean:`,
    lines,
    `Use one of the paths above, or search_files / grep; do not guess.`,
  ].join("\n");
}

export function isEnoentError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
