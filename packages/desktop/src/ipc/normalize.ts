/**
 * IPC 入参归一化：把渲染进程传来的不可信 payload 收敛成类型安全的形状。
 *
 * 这些逻辑原本内联在各自的 register*Handler 里，跟着 ipcMain 一起没法单测；
 * 抽成独立纯函数后既可复用，也能覆盖边界（空值 / 负数 / 错类型）。
 */

/** mcp server id：小写 slug，非法字符折叠为 `-`，空值回退 `"server"`。 */
export function slugify(raw: unknown): string {
  return (
    String(raw ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "server"
  );
}

/** 二进制 payload：Uint8Array 原样、ArrayBuffer 包装、其它一律视为空。 */
export function toBytes(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  return new Uint8Array(0);
}

/** 条数上限：只接受有限数字，其余回退默认值。 */
export function normalizeLimit(limit: unknown, fallback = 60): number {
  return typeof limit === "number" && Number.isFinite(limit) ? limit : fallback;
}

/**
 * 日志查询：`file` 缺失或为空白时退化为 `"all"`（表示不过滤），其余字段原样透传。
 * 保持泛型以免和 logs 模块的类型耦合。
 */
export function normalizeLogsQuery<T extends { file?: string }>(query: unknown): T {
  const q = (query && typeof query === "object" ? query : {}) as T;
  if (typeof q.file !== "string" || !q.file.trim()) return { ...q, file: "all" };
  return q;
}

/**
 * 上下文路径列表：只保留非空字符串。
 * 非数组返回 `undefined`（与「传了空数组」区分——前者代表未提供该维度）。
 */
export function normalizeContextPaths(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}
