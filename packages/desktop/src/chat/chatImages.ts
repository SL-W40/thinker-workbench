/**
 * 用户聊天附图：落盘到工作空间 images 目录、压缩、预览读取。
 * 像素与会话分离；会话只存 ChatImageRef。
 */
import fs from "node:fs";
import path from "node:path";
import { type ChatImageRef, createId } from "@thinker-workbench/shared";
import { nativeImage } from "electron";
import { getDataDir, getWorkspaceImagesDir } from "../config/paths";
import { getWorkspace } from "../db/workspacesStore";

/** 长边上限（与 Cursor ImageUtil 对齐）。 */
const MAX_EDGE = 1024;
/** 落盘体积上限（字节）。 */
const MAX_BYTES = 1024 * 1024;
/** 原始输入体积上限（拒绝过大源文件）。 */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/** MIME → 扩展名。 */
function extForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/heic":
    case "image/heif":
      return ".heic";
    default:
      return ".png";
  }
}

/** 规范化 MIME。 */
function normalizeMime(raw: string): string {
  const m = raw.trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

/**
 * 解析后的路径须落在某一工作空间的 images 目录内。
 * 用于预览与 engine 编码前的安全校验。
 */
export function resolveAllowedChatImagePath(imagePath: string): string | null {
  const resolved = path.resolve(imagePath);
  const workspacesRoot = path.resolve(getDataDir(), "workspaces");
  const rel = path.relative(workspacesRoot, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  // workspaces/<id>/images/<file>
  if (parts.length < 3 || parts[1] !== "images") return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

/**
 * 压缩并写入工作空间 images 目录。
 * gif / 无法再压的图：nativeImage 能加载则导出 png；否则原样写入（仍须 ≤ MAX_BYTES）。
 */
export function saveChatImage(
  workspaceId: string,
  input: { bytes: Uint8Array; mime: string; name?: string },
): ChatImageRef {
  const wsId = workspaceId.trim();
  if (!wsId) throw new Error("workspaceId is required.");
  if (!getWorkspace(wsId)) throw new Error("Workspace not found.");

  const mime = normalizeMime(input.mime || "");
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error(`Unsupported image type: ${mime || "(empty)"}`);
  }

  const source = Buffer.from(input.bytes);
  if (source.byteLength === 0) throw new Error("Image is empty.");
  if (source.byteLength > MAX_SOURCE_BYTES) {
    throw new Error("Image is too large.");
  }

  const id = createId("img");
  const dir = getWorkspaceImagesDir(wsId);
  fs.mkdirSync(dir, { recursive: true });

  const { buffer, outMime, width, height } = compressImageBuffer(source, mime);
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("Image exceeds 1 MB after compression.");
  }

  const ext = extForMime(outMime);
  const filePath = path.join(dir, `${id}${ext}`);
  fs.writeFileSync(filePath, buffer);

  return {
    id,
    path: filePath,
    mime: outMime,
    width,
    height,
  };
}

/** 读取预览 data URL；路径非法或缺失时返回 null。 */
export function readChatImagePreview(imagePath: string): { dataUrl: string } | null {
  const resolved = resolveAllowedChatImagePath(imagePath);
  if (!resolved) return null;
  const buf = fs.readFileSync(resolved);
  if (buf.byteLength > 8 * 1024 * 1024) return null;
  const ext = path.extname(resolved).toLowerCase();
  const mime =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/png";
  return { dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
}

/** 压缩：长边 ≤ 1024，体积尽量 ≤ 1MB；gif 导出为 png 静帧。 */
function compressImageBuffer(
  source: Buffer,
  mime: string,
): { buffer: Buffer; outMime: string; width: number; height: number } {
  const img = nativeImage.createFromBuffer(source);
  if (img.isEmpty()) {
    // nativeImage 不支持时：若已 ≤ 1MB 原样落盘（保留 gif/webp 原文件）
    if (source.byteLength <= MAX_BYTES && (mime === "image/gif" || mime === "image/webp")) {
      return { buffer: source, outMime: mime, width: 0, height: 0 };
    }
    throw new Error("Image format is not supported.");
  }

  const size = img.getSize();
  let width = size.width;
  let height = size.height;
  let working = img;

  const scale = Math.max(width / MAX_EDGE, height / MAX_EDGE, 1);
  if (scale > 1) {
    width = Math.max(1, Math.floor(width / scale));
    height = Math.max(1, Math.floor(height / scale));
    working = img.resize({ width, height, quality: "best" });
  }

  // gif / heic 统一存 png；jpeg 保持 jpeg；其余优先 png
  const preferJpeg = mime === "image/jpeg";
  let outMime = preferJpeg ? "image/jpeg" : "image/png";
  let buffer = preferJpeg ? working.toJPEG(90) : working.toPNG();

  if (preferJpeg && buffer.byteLength > MAX_BYTES) {
    for (const q of [80, 70, 60, 50, 40, 30]) {
      buffer = working.toJPEG(q);
      if (buffer.byteLength <= MAX_BYTES) break;
    }
  }

  if (!preferJpeg && buffer.byteLength > MAX_BYTES) {
    // png 过大则转 jpeg 再压
    outMime = "image/jpeg";
    for (const q of [90, 80, 70, 60, 50, 40, 30]) {
      buffer = working.toJPEG(q);
      if (buffer.byteLength <= MAX_BYTES) break;
    }
  }

  const finalSize = working.getSize();
  return {
    buffer,
    outMime,
    width: finalSize.width,
    height: finalSize.height,
  };
}
