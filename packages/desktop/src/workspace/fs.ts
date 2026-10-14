/**
 * 工作空间文件系统：目录树、读写文本文件、媒体预览（路径沙箱）。
 */
import fs from "node:fs";
import path from "node:path";
import type { WorkspaceFile, WorkspaceMediaKind, WorkspaceNode } from "@thinker-workbench/shared";

type ProcessWithAsar = NodeJS.Process & { noAsar?: boolean };

/**
 * Electron 会把路径里的 `.asar` 当成应用归档，`stat` 时调用已弃用的 `fs.Stats` 构造函数（DEP0180）。
 * 工作空间是用户磁盘，列出和读写期间关掉 asar 拦截，把 `app.asar` 等当成普通文件。
 */
function withoutAsar<T>(fn: () => T): T {
  const proc = process as ProcessWithAsar;
  const prev = proc.noAsar;
  proc.noAsar = true;
  try {
    return fn();
  } finally {
    proc.noAsar = prev;
  }
}

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
  if (IMAGE_MIME[ext]) return { kind: "image", mime: IMAGE_MIME[ext] };
  if (AUDIO_MIME[ext]) return { kind: "audio", mime: AUDIO_MIME[ext] };
  if (VIDEO_MIME[ext]) return { kind: "video", mime: VIDEO_MIME[ext] };
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
  return withoutAsar(() => listTreeInner(root, maxDepth));
}

function listTreeInner(root: string, maxDepth: number): WorkspaceNode {
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

/** 读取工作空间内文件；媒体附带 data URL 预览。缺失时返回 `missing: true`（不抛错）。 */
export function readWorkspaceFile(root: string, relPath: string): WorkspaceFile {
  return withoutAsar(() => readWorkspaceFileInner(root, relPath));
}

function readWorkspaceFileInner(root: string, relPath: string): WorkspaceFile {
  const rel = (relPath || ".").replace(/\\/g, "/").replace(/^\.\//, "");
  const abs = assertInside(root, path.join(root, rel));
  const posix = rel.replace(/\\/g, "/");
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return {
      path: posix,
      content: "",
      size: 0,
      binary: false,
      editable: false,
      missing: true,
    };
  }
  const st = fs.statSync(abs);
  const buf = fs.readFileSync(abs);
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

  // 文本一律按 UTF-8；非法字节则只读预览（避免保存时用 U+FFFD 写回污染文件）
  let content: string;
  let editable = true;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    content = new TextDecoder("utf-8").decode(buf);
    editable = false;
  }
  // 去掉 UTF-8 BOM，避免编辑器里多出不可见字符
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  return {
    path: posix,
    content,
    size: st.size,
    binary: false,
    editable,
    mediaKind: null,
    mimeType: null,
    previewDataUrl: null,
  };
}

/** 写入工作空间内文本文件（父目录不存在则创建）；始终 UTF-8，无 BOM。 */
export function writeWorkspaceFile(root: string, relPath: string, content: string): void {
  withoutAsar(() => writeWorkspaceFileInner(root, relPath, content));
}

function writeWorkspaceFileInner(root: string, relPath: string, content: string): void {
  const rel = (relPath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!rel || rel === ".") throw new Error("Invalid file path.");
  const abs = assertInside(root, path.join(root, rel));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  // 显式 Buffer，避免 Electron/Node 在部分环境下按系统代码页写盘
  const body = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  fs.writeFileSync(abs, Buffer.from(body, "utf8"));
}
