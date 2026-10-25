/**
 * 版本号读取（供更新组件在没有 Electron app 上下文时兜底）。
 */
import fs from "node:fs";
import path from "node:path";

/** 读取当前包版本；读不到时返回占位版本（打包态实际用 `app.getVersion()`）。 */
export function getCurrentPackageVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
