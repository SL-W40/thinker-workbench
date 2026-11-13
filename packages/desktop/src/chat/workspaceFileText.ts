/**
 * 工作空间文件文本解析：文档悬停预览等场景走可插拔解析层抽纯文本。
 * （聊天侧仅支持图片附图；工作空间 `@path` 文档仍由此解析。）
 */
import fs from "node:fs";
import path from "node:path";
import { parseFile } from "@thinker-workbench/file-parsers";
import { getWorkspace } from "../db/workspacesStore";

/** 读取工作空间内某文件经解析层抽取的纯文本（文档悬停预览用）。 */
export async function parseWorkspaceFileText(
  workspaceId: string,
  relPath: string,
): Promise<{ text: string } | null> {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;
  const root = path.resolve(ws.rootPath);
  const abs = path.resolve(root, relPath);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  const buf = fs.readFileSync(abs);
  const parsed = await parseFile({ bytes: buf, name: path.basename(abs) });
  return parsed.text ? { text: parsed.text } : null;
}
