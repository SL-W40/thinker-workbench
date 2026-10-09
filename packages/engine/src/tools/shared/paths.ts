/**
 * 工作区路径解析：相对路径始终锚在 workspace root；
 * 绝对路径是否允许越界由 workspaceAccess + 工具读写意图决定。
 */
import path from "node:path";
import { getWorkspaceAccess } from "../../workspace";

function normalizeRoot(root: string): string {
  return path.resolve(root);
}

/** 判断 candidate 是否为 root 本身或其子路径。 */
export function isInsideWorkspace(root: string, candidate: string): boolean {
  const base = normalizeRoot(root);
  const target = path.resolve(candidate);
  const rel = path.relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** 工具对路径的读写意图（用于区外放行分流）。 */
export type PathAccessIntent = "read" | "write";

export type ResolveWorkspacePathOptions = {
  /** 缺省按 write 处理（更严）。 */
  access?: PathAccessIntent;
};

/**
 * 解析工作区相对路径。空 / `.` → 工作区根。
 * 绝对路径：区内恒可；区外按 `workspaceAccess` + `access` 意图放行或抛错。
 */
export function resolveWorkspacePath(
  workspaceRoot: string,
  relativePath?: string,
  options?: ResolveWorkspacePathOptions,
): string {
  const root = normalizeRoot(workspaceRoot);
  const raw = (relativePath ?? "").trim();
  if (!raw || raw === ".") {
    return root;
  }

  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw);
  if (isInsideWorkspace(root, resolved)) {
    return resolved;
  }

  const intent = options?.access ?? "write";
  const mode = getWorkspaceAccess();
  const allowed =
    mode === "full" || (mode === "readOutside" && intent === "read");
  if (!allowed) {
    throw new Error(`Path escapes workspace (${intent}): ${raw}`);
  }
  return resolved;
}

/**
 * 相对工作区的展示路径，统一用 posix 分隔符。
 * 目标在 root 外时返回绝对路径（posix 分隔），避免 `../` 误导。
 */
export function toWorkspaceRelative(workspaceRoot: string, absolutePath: string): string {
  const root = normalizeRoot(workspaceRoot);
  const target = path.resolve(absolutePath);
  if (!isInsideWorkspace(root, target)) {
    return target.replace(/\\/g, "/");
  }
  const rel = path.relative(root, target);
  return (rel || ".").replace(/\\/g, "/");
}
