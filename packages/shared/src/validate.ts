/**
 * 轻量运行时类型守卫：JSON.parse / IPC / 持久化数据在编译期类型之外的第一道防线。
 * 不引入 zod 等依赖，提供常用原语；缺字段 / 旧版 schema 时由调用方决定回退或抛错，
 * 避免「外部数据被盲目 `as` 强转后于下游才崩」。
 */

/** 是否为非 null 的普通对象（非数组）。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 读取字符串字段；不存在或类型不符返回 undefined。 */
export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** 读取有限数字字段；NaN / Infinity / 非数字返回 undefined。 */
export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** 读取布尔字段；否则 undefined。 */
export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** 读取数组字段；否则 undefined。 */
export function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

/** 读取对象字段（非数组）；否则 undefined。 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

/** 读取字符串数组字段（元素需全为字符串）；否则 undefined。 */
export function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((v) => typeof v === "string") ? (value as string[]) : undefined;
}

/** 安全 JSON.parse：解析失败或结果非对象时返回 undefined。 */
export function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}
