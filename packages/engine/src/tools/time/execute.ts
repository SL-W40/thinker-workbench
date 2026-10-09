/** 返回本机当前时间的 ISO-8601 字符串。 */
export async function timeTool(): Promise<string> {
  return new Date().toISOString();
}
