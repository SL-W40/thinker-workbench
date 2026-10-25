/**
 * 截图落盘：`<dataDir>/cache/computer/images/`，保留最近若干张。
 */
import fs from "node:fs";
import path from "node:path";
import { dataPath } from "@thinker-workbench/shared";
import { getDataDir } from "../../config/dataDir";
import type { ToolResult } from "../../tools/types";
import { parseScreenInfo, runPowerShell, screenInfoText, screenshotPs } from "./powershell";

/** 截图保留数量上限（超出删最旧）。 */
const MAX_KEEP_SCREENSHOTS = 60;

export function screenshotDir(): string | null {
  const dataDir = getDataDir();
  if (!dataDir) return null;
  return dataPath(dataDir, "cacheComputerImages");
}

/** 生成截图路径并清理旧文件（保留最近 MAX_KEEP_SCREENSHOTS 张）。 */
export function saveScreenshotPath(): string {
  const dir = screenshotDir();
  if (!dir) throw new Error("Data directory not configured.");
  fs.mkdirSync(dir, { recursive: true });
  try {
    const files = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith("computer-") && n.endsWith(".png"))
      .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => a.t - b.t);
    const excess = files.length - MAX_KEEP_SCREENSHOTS + 1;
    for (const f of excess > 0 ? files.slice(0, excess) : []) {
      try {
        fs.unlinkSync(path.join(dir, f.n));
      } catch {
        /* best-effort */
      }
    }
  } catch {
    /* 清理失败不阻断截图 */
  }
  return path.join(dir, `computer-${Date.now()}.png`);
}

export async function screenshot(): Promise<ToolResult> {
  const file = saveScreenshotPath();
  const stdout = await runPowerShell(screenshotPs(file));
  const info = parseScreenInfo(stdout);
  if (!info) return { ok: false, output: `screenshot saved: ${file} (screen info unavailable)` };
  return {
    ok: true,
    output: `screenshot saved: ${file}\n${screenInfoText(info)}`,
    ui: { resultPaths: [file], resultPathKinds: ["image"], modelImages: [file] },
  };
}
