/**
 * 工作空间文件系统：目录树、读写文本文件、媒体预览（路径沙箱）。
 */
import fs from "node:fs";
import path from "node:path";
import type {
  WorkspaceFile,
  WorkspaceMediaKind,
  WorkspaceNode,
} from "@thinker-workbench/shared";

const SKIP_NAMES = new Set(["node_modules", ".git", ".DS_Store", "diff-cache", "dist", ".next"]);

const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|less|css|html|htm|yml|yaml|toml|xml|svg|sh|ps1|py|rs|go|java|kt|swift|c|cc|cpp|h|hpp|cs|sql|graphql|env|ignore|editorconfig|gitignore|npmrc|prettierrc)$/i;

/** 预览 data URL 上限（约 20MB），过大则只返回类型提示。 */
const MEDIA_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};

const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
};

/** 按扩展名识别可预览媒体。 */
function detectMedia(filePath: string): { kind: WorkspaceMediaKind; mime: string } | null {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!ext) return null;
  if (IMAGE_MIME[ext]) return { kind: "image", mime: IMAGE_MIME[ext]! };
  if (AUDIO_MIME[ext]) return { kind: "audio", mime: AUDIO_MIME[ext]! };
  if (VIDEO_MIME[ext]) return { kind: "video", mime: VIDEO_MIME[ext]! };
  return null;
}

/** 确保 target 落在 root 内。 */
function assertInside(root: string, target: string): string {
  const absRoot = path.resolve(root);
  const abs = path.resolve(target);
  const rel = path.relative(absRoot, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes workspace: ${target}`);
  }
  return abs;
}

/** 相对路径规范化（posix）。 */
function toRel(root: string, abs: string): string {
  const rel = path.relative(path.resolve(root), abs).replace(/\\/g, "/");
  return rel || ".";
}

/** 粗判是否二进制：媒体 / 含 NUL 不可编辑；已知文本扩展名放行。 */
function looksBinary(filePath: string, buf: Buffer): boolean {
  if (detectMedia(filePath)) return true;
  if (buf.includes(0)) return true;
  if (TEXT_EXT.test(filePath)) return false;
  // 未知扩展名且无 NUL：仍按文本打开
  return false;
}

/**
 * 列出工作空间目录树（深度上限，跳过常见噪音目录）。
 */
export function listTree(root: string, maxDepth = 6): WorkspaceNode {
  const abs = path.resolve(root);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error("Workspace path missing.");
  }

  function walk(dir: string, depth: number): WorkspaceNode {
    const st = fs.statSync(dir);
    const node: WorkspaceNode = {
      name: path.basename(dir) || dir,
      path: toRel(abs, dir),
      type: st.isDirectory() ? "dir" : "file",
      size: st.isFile() ? st.size : undefined,
    };
    if (!st.isDirectory() || depth >= maxDepth) return node;
    const children: WorkspaceNode[] = [];
    for (const name of fs.readdirSync(dir)) {
      if (SKIP_NAMES.has(name)) continue;
      children.push(walk(path.join(dir, name), depth + 1));
    }
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
    node.children = children;
    return node;
  }

  return walk(abs, 0);
}

/** 读取工作空间内文件；媒体附带 data URL 预览。 */
export function readWorkspaceFile(root: string, relPath: string): WorkspaceFile {
  const rel = (relPath || ".").replace(/\\/g, "/").replace(/^\.\//, "");
  const abs = assertInside(root, path.join(root, rel));
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error("File not found.");
  }
  const st = fs.statSync(abs);
  const buf = fs.readFileSync(abs);
  const posix = rel.replace(/\\/g, "/");
  const media = detectMedia(abs);

  if (media) {
    const tooLarge = st.size > MEDIA_PREVIEW_MAX_BYTES;
    return {
      path: posix,
      content: "",
      size: st.size,
      binary: true,
      editable: false,
      mediaKind: media.kind,
      mimeType: media.mime,
      previewDataUrl: tooLarge ? null : `data:${media.mime};base64,${buf.toString("base64")}`,
    };
  }

  if (looksBinary(abs, buf)) {
    return {
      path: posix,
      content: "",
      size: st.size,
      binary: true,
      editable: false,
      mediaKind: null,
      mimeType: null,
      previewDataUrl: null,
    };
  }
  return {
    path: posix,
    content: buf.toString("utf8"),
    size: st.size,
    binary: false,
    editable: true,
    mediaKind: null,
    mimeType: null,
    previewDataUrl: null,
  };
}

/** 写入工作空间内文本文件（父目录不存在则创建）。 */
export function writeWorkspaceFile(root: string, relPath: string, content: string): void {
  const rel = (relPath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!rel || rel === ".") throw new Error("Invalid file path.");
  const abs = assertInside(root, path.join(root, rel));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}
