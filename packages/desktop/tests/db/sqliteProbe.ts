/**
 * 测试用的 SQLite 可用性探测。
 *
 * `better-sqlite3` 的原生产物在部分环境（例如只针对 Electron ABI 重建过）下无法被
 * 纯 Node 加载，`new Database(...)` 会抛 ERR_DLOPEN_FAILED。与其让整批 DB 用例
 * 在这种环境里红掉，这里统一探测一次：不可用则跳过需要真库的分组，
 * 纯函数分组照常在跑。
 */
import Database from "better-sqlite3";

let cached: boolean | null = null;

/** 能否在当前 Node 进程里真正打开 SQLite（结果按进程缓存）。 */
export function probeSqlite(): boolean {
  if (cached !== null) return cached;
  try {
    const db = new Database(":memory:");
    db.close();
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}
