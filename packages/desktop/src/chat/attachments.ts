/**
 * 外部附件：工作空间外的文件经上传/粘贴/拖拽落盘到 dataDir/attachments，
 * 以 `@file:<id>` 形式在草稿中被引用；悬停预览与 AI 上下文都消费它。
 * 文档类（pdf/doc/docx/xls…）走可插拔解析层抽文本。
 */
import fs from "node:fs";
import path from "node:path";
import { parseFile } from "@thinker-workbench/file-parsers";
import {
  type AttachmentKind,
  type ChatAttachmentRef,
  chatImageAllowed,
  createId,
} from "@thinker-workbench/shared";
import { getDataDir, getWorkspaceAttachmentsDir as workspaceAttachmentsDir } from "../config/paths";
import { getWorkspace } from "../db/workspacesStore";

/** 原始输入体积上限（拒绝过大源文件）。 */
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
/** 图片预览 dataUrl 上限。 */
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

const DOC_EXTS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "xml",
  "html",
  "htm",
  "log",
]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function inferKind(mime: string, ext: string): AttachmentKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  const isDoc =
    DOC_EXTS.has(ext) ||
    mime === "application/pdf" ||
    mime.includes("officedocument") ||
    mime.startsWith("text/");
  return isDoc ? "document" : "other";
}

/** 外部附件目录：`<dataDir>/workspaces/<id>/attachments`。 */
export function getWorkspaceAttachmentsDir(workspaceId: string): string {
  return workspaceAttachmentsDir(workspaceId);
}

/**
 * 解析后的路径须落在某一工作空间的 attachments 目录内（安全校验）。
 */
export function resolveAllowedAttachmentPath(attachmentPath: string): string | null {
  const resolved = path.resolve(attachmentPath);
  const { workspacesRoot } = chatImageAllowed(getDataDir());
  const rel = path.relative(path.resolve(workspacesRoot), resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  // workspaces/<id>/attachments/<file>
  if (parts.length < 3 || parts[1] !== "attachments") return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

/** 落盘外部附件（字节 + 元数据），返回引用。 */
export function saveAttachment(
  workspaceId: string,
  input: { bytes: Uint8Array; mime: string; name: string },
): ChatAttachmentRef {
  const wsId = workspaceId.trim();
  if (!wsId) throw new Error("workspaceId is required.");
  if (!getWorkspace(wsId)) throw new Error("Workspace not found.");

  const name = (input.name || "file").trim() || "file";
  const mime = (input.mime || "application/octet-stream").trim().toLowerCase();
  const source = Buffer.from(input.bytes);
  if (source.byteLength === 0) throw new Error("Attachment is empty.");
  if (source.byteLength > MAX_ATTACHMENT_BYTES) throw new Error("Attachment is too large.");

  const id = createId("att");
  const ext = extOf(name);
  const dir = getWorkspaceAttachmentsDir(wsId);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, ext ? `${id}.${ext}` : id);
  fs.writeFileSync(filePath, source);
  // 元数据侧车，保留原始文件名（落盘文件名只含 id）
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ name, mime }));

  return {
    id,
    name,
    path: filePath,
    mime,
    size: source.byteLength,
    kind: inferKind(mime, ext),
  };
}

/** 读取附件预览：图片返回 dataUrl，文档/文本返回解析文本，缺失返回 null。 */
export async function readAttachment(
  workspaceId: string,
  id: string,
): Promise<{
  name: string;
  size: number;
  mime: string;
  dataUrl?: string | null;
  text?: string | null;
} | null> {
  const dir = getWorkspaceAttachmentsDir(workspaceId);
  if (!fs.existsSync(dir)) return null;
  const metaPath = path.join(dir, `${id}.json`);
  if (!fs.existsSync(metaPath)) return null;
  let meta: { name: string; mime: string };
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { name: string; mime: string };
  } catch {
    return null;
  }
  const entries = fs.readdirSync(dir);
  const dataFile = entries.find((f) => f !== `${id}.json` && f.startsWith(id));
  if (!dataFile) return null;
  const resolved = resolveAllowedAttachmentPath(path.join(dir, dataFile));
  if (!resolved) return null;

  const buf = fs.readFileSync(resolved);
  const result: {
    name: string;
    size: number;
    mime: string;
    dataUrl?: string | null;
    text?: string | null;
  } = {
    name: meta.name,
    size: buf.byteLength,
    mime: meta.mime,
  };

  const kind = inferKind(meta.mime, extOf(dataFile));
  if (kind === "image") {
    result.dataUrl =
      buf.byteLength <= MAX_PREVIEW_BYTES
        ? `data:${meta.mime};base64,${buf.toString("base64")}`
        : null;
  } else {
    const parsed = await parseFile({ bytes: buf, mime: meta.mime, name: dataFile });
    result.text = parsed.text ?? null;
  }
  return result;
}

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
