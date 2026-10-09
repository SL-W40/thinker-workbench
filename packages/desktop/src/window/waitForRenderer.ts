/**
 * 开发态等待 Vite / HTTP 渲染服务就绪。
 *
 * 冷启动时主进程可能早于 Vite；通过指数退避轮询 GET，直到有任意 HTTP 响应或超时。
 */

/**
 * 轮询直到渲染服务应答。
 * @param url 开发态渲染 URL
 * @param timeoutMs 超时毫秒，默认 90s
 * @throws 超时仍未就绪时抛错
 */
export async function waitForRenderer(url: string, timeoutMs = 90_000): Promise<void> {
  const started = Date.now();
  let delay = 80;

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      // 任意 HTTP 状态码都表示服务已起来（含异常路径上的 404）
      if (res.status > 0) return;
    } catch {
      // 尚未就绪，继续等待
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(400, Math.floor(delay * 1.25));
  }

  throw new Error(`Renderer not ready within ${timeoutMs}ms: ${url}`);
}
