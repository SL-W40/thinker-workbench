/**
 * Inspector 本地图标（自 v1 panes/icons 精简）。
 */
import type { ReactNode } from "react";

function IconFolder({ open }: { open?: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {open ? (
        <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.7a1 1 0 0 1 .8.4l.7 1h4.8A1.5 1.5 0 0 1 14 5.9v.6H4.6a1.5 1.5 0 0 0-1.44 1.08L2 11.5zM2 11.5 3.16 7.58A1.5 1.5 0 0 1 4.6 6.5h9.9l-1.3 5.42A1.5 1.5 0 0 1 11.74 13H3.44A1.5 1.5 0 0 1 2 11.5z" />
      ) : (
        <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.7a1 1 0 0 1 .8.4l.7 1H12.5A1.5 1.5 0 0 1 14 5.9v5.6A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
      )}
    </svg>
  );
}

type FileGlyphKind =
  | "ts"
  | "js"
  | "json"
  | "md"
  | "css"
  | "html"
  | "py"
  | "sh"
  | "go"
  | "rs"
  | "java"
  | "image"
  | "pdf"
  | "zip"
  | "lock"
  | "config"
  | "git"
  | "log"
  | "text";

/** 常见扩展名 → 图标族（对齐 Cursor/Seti 风格，非全量）。 */
const EXT_GLYPH: Record<string, FileGlyphKind> = {
  ts: "ts",
  tsx: "ts",
  mts: "ts",
  cts: "ts",
  js: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  json: "json",
  jsonc: "json",
  json5: "json",
  md: "md",
  mdx: "md",
  markdown: "md",
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  html: "html",
  htm: "html",
  vue: "html",
  svelte: "html",
  astro: "html",
  py: "py",
  pyw: "py",
  pyi: "py",
  sh: "sh",
  bash: "sh",
  zsh: "sh",
  fish: "sh",
  ps1: "sh",
  bat: "sh",
  cmd: "sh",
  go: "go",
  rs: "rs",
  java: "java",
  kt: "java",
  kts: "java",
  scala: "java",
  groovy: "java",
  cs: "java",
  fs: "java",
  php: "html",
  rb: "py",
  erb: "py",
  swift: "ts",
  c: "ts",
  h: "ts",
  cc: "ts",
  cpp: "ts",
  cxx: "ts",
  hpp: "ts",
  m: "ts",
  mm: "ts",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  ico: "image",
  avif: "image",
  bmp: "image",
  pdf: "pdf",
  zip: "zip",
  tar: "zip",
  gz: "zip",
  tgz: "zip",
  rar: "zip",
  "7z": "zip",
  lock: "lock",
  yml: "config",
  yaml: "config",
  toml: "config",
  ini: "config",
  env: "config",
  conf: "config",
  cfg: "config",
  properties: "config",
  xml: "config",
  plist: "config",
  graphql: "config",
  gql: "config",
  sql: "config",
  prisma: "config",
  log: "log",
  txt: "text",
  csv: "text",
  tsv: "text",
  rtf: "text",
};

const GLYPH_COLOR: Record<FileGlyphKind, string> = {
  ts: "#3178c6",
  js: "#b99a1c",
  json: "#b0742a",
  md: "#5b7fa6",
  css: "#a05bbf",
  html: "#cf5b2e",
  py: "#3d8a63",
  sh: "#5a8a52",
  go: "#00add8",
  rs: "#dea584",
  java: "#b07219",
  image: "#7d8f4e",
  pdf: "#c23b3b",
  zip: "#96742f",
  lock: "#8a8a84",
  config: "#8a6d3b",
  git: "#f05032",
  log: "#9a9a94",
  text: "#9a9a94",
};

const SPECIAL_NAME_GLYPH: Record<string, FileGlyphKind> = {
  dockerfile: "sh",
  makefile: "sh",
  rakefile: "sh",
  gemfile: "py",
  procfile: "sh",
  "docker-compose.yml": "config",
  "docker-compose.yaml": "config",
  "package.json": "json",
  "package-lock.json": "lock",
  "pnpm-lock.yaml": "lock",
  "yarn.lock": "lock",
  "cargo.lock": "lock",
  "composer.lock": "lock",
  "go.sum": "lock",
  "go.mod": "go",
  "cargo.toml": "rs",
  "tsconfig.json": "ts",
  "jsconfig.json": "js",
  ".gitignore": "git",
  ".gitattributes": "git",
  ".gitmodules": "git",
  ".npmrc": "config",
  ".nvmrc": "config",
  ".editorconfig": "config",
  ".prettierrc": "config",
  ".eslintrc": "config",
  ".eslintrc.js": "config",
  ".eslintrc.cjs": "config",
  ".eslintrc.json": "config",
  ".env": "config",
  ".env.local": "config",
  ".env.development": "config",
  ".env.production": "config",
  license: "text",
  readme: "md",
  "readme.md": "md",
};

function glyphKind(name: string): FileGlyphKind {
  const base = name.replace(/\\/g, "/").split("/").pop() || name;
  const lower = base.toLowerCase();
  if (SPECIAL_NAME_GLYPH[lower]) return SPECIAL_NAME_GLYPH[lower];
  if (lower.startsWith("dockerfile")) return "sh";
  if (lower.endsWith(".lock")) return "lock";
  const dot = lower.lastIndexOf(".");
  const ext = dot > 0 ? lower.slice(dot + 1) : "";
  if (!ext) return "text";
  return EXT_GLYPH[ext] ?? "text";
}

/** 按扩展名着色/变形的文件图标。 */
function FileGlyph({ name }: { name: string }) {
  const kind = glyphKind(name);
  const color = GLYPH_COLOR[kind];
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: color,
    strokeWidth: 1.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "ts":
    case "js":
      return (
        <svg {...common}>
          <path d="M5.6 5 3 8l2.6 3M10.4 5 13 8l-2.6 3" />
        </svg>
      );
    case "json":
      return (
        <svg {...common}>
          <path d="M6 2.8c-1.1 0-1.5.6-1.5 1.6v1.2c0 .9-.5 1.4-1.3 1.5v.8c.8.1 1.3.6 1.3 1.5v1.2c0 1 .4 1.6 1.5 1.6M10 2.8c1.1 0 1.5.6 1.5 1.6v1.2c0 .9.5 1.4 1.3 1.5v.8c-.8.1-1.3.6-1.3 1.5v1.2c0 1-.4 1.6-1.5 1.6" />
        </svg>
      );
    case "md":
      return (
        <svg {...common}>
          <path d="M2.5 4.5h11v7h-11z" />
          <path d="M4.5 9.5v-3l1.6 1.8 1.6-1.8v3M10.4 6.5v3M10.4 9.5l-1.2-1.2M10.4 9.5l1.2-1.2" />
        </svg>
      );
    case "css":
      return (
        <svg {...common}>
          <path d="M8 2.6 3.4 4.2l.7 6.2L8 13.4l3.9-3 .7-6.2z" />
          <path d="M8 6.2v3.4" />
        </svg>
      );
    case "html":
      return (
        <svg {...common}>
          <path d="M3 3.5h10l-.9 9.2L8 14l-4.1-1.3z" />
          <path d="m6.4 6.6-1.2 1.9 1.2 1.9M9.6 6.6l1.2 1.9-1.2 1.9" />
        </svg>
      );
    case "py":
      return (
        <svg {...common}>
          <path d="M8 2.5c-2 0-2.6.9-2.6 2v1.3h2.9v.5H4.4c-1.2 0-2 .9-2 2.4s.8 2.4 2 2.4h1v-1.6c0-1.2 1-2.1 2.2-2.1" />
          <path d="M8 13.5c2 0 2.6-.9 2.6-2v-1.3H7.7v-.5h3.9c1.2 0 2-.9 2-2.4" />
          <path d="M6.6 4.2h.01M9.4 11.8h.01" />
        </svg>
      );
    case "sh":
      return (
        <svg {...common}>
          <rect x="2.5" y="3.5" width="11" height="9" rx="1.6" />
          <path d="m5 6.6 2 1.7-2 1.7M8.6 10.2h2.6" />
        </svg>
      );
    case "go":
      return (
        <svg {...common}>
          <path d="M3.2 6.2h9.6c.7 0 1.2.6 1 1.2l-.7 2.4c-.2.6-.8 1-1.4 1H5.3c-.6 0-1.2-.4-1.4-1l-.7-2.4c-.2-.6.3-1.2 1-1.2z" />
          <path d="M6.2 5.2c0-.8.6-1.4 1.3-1.4h.7c.7 0 1.3.6 1.3 1.4" />
          <circle cx="6.4" cy="8.2" r=".55" fill={color} stroke="none" />
          <circle cx="9.6" cy="8.2" r=".55" fill={color} stroke="none" />
        </svg>
      );
    case "rs":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.2" />
          <circle cx="8" cy="8" r="1.4" />
          <path d="M8 2.8v1.4M8 11.8v1.4M2.8 8h1.4M11.8 8h1.4M4.3 4.3l1 1M10.7 10.7l1 1M11.7 4.3l-1 1M5.3 10.7l-1 1" />
        </svg>
      );
    case "java":
      return (
        <svg {...common}>
          <path d="M5.2 9.6c2.8 1.5 5.6.4 6.4-.6M4.8 11.2c3.4 1.8 7 .2 7.6-1" />
          <path d="M8.6 8.2c-.2-1.6 1.1-2.6 1.1-3.7 0-1.1-.8-1.6-1.7-1.6" />
          <path d="M7.2 8.6c0-1.8 1.4-2.5 1.4-4" />
        </svg>
      );
    case "git":
      return (
        <svg {...common}>
          <circle cx="4.2" cy="11" r="1.5" />
          <circle cx="11.8" cy="11" r="1.5" />
          <circle cx="8" cy="4.2" r="1.5" />
          <path d="M4.2 9.5V7.2L8 4.8M11.8 9.5V7.2L8 4.8" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="2.5" y="3.5" width="11" height="9" rx="1.6" />
          <circle cx="6" cy="6.7" r="1" />
          <path d="m3.6 11.2 2.8-2.8 2.3 2.3 1.8-1.8 1.9 1.9" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...common}>
          <path d="M4 2h5l3.5 3.5V14H4zM9 2v4h4" />
          <path d="M6 9.2h1.1a1 1 0 0 1 0 2H6zM6 9.2V12M9.4 12V9.2h.9a1.4 1.4 0 0 1 0 2.8h-.9" />
        </svg>
      );
    case "zip":
      return (
        <svg {...common}>
          <path d="M4 2h5l3.5 3.5V14H4zM9 2v4h4" />
          <path d="M7 3.2v.9M8 4.6v.9M7 6v.9M8 7.4v.9M7.4 9h1.2v1.8H7.4z" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="4" y="7" width="8" height="6" rx="1.4" />
          <path d="M6 7V5.4a2 2 0 0 1 4 0V7M8 9.4v1.4" />
        </svg>
      );
    case "config":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.1" />
          <path d="M8 2.6v1.8M8 11.6v1.8M2.6 8h1.8M11.6 8h1.8M4.3 4.3l1.3 1.3M10.4 10.4l1.3 1.3M11.7 4.3l-1.3 1.3M5.6 10.4l-1.3 1.3" />
        </svg>
      );
    case "log":
      return (
        <svg {...common}>
          <path d="M3.5 4.5h9M3.5 8h9M3.5 11.5h5.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M4 2h5l3.5 3.5V14H4zM9 2v4h4" />
          <path d="M6 9h4M6 11h3" />
        </svg>
      );
  }
}

function IconPanelHide() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2.5" width="12" height="11" rx="1.6" />
      <path d="M10.2 2.5v11" />
    </svg>
  );
}

function IconChevron({ open }: { open?: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 0.12s ease" }}
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

function MenuIcon({ d, extra }: { d: string; extra?: ReactNode }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
      {extra}
    </svg>
  );
}

const MI = {
  open: <MenuIcon d="M2.5 8.5 6 12l7.5-8" />,
  newFile: <MenuIcon d="M4 2h5l3.5 3.5V14H4zM9 2v4h4M8 8v4M6 10h4" />,
  newFolder: (
    <MenuIcon d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.7a1 1 0 0 1 .8.4l.7 1H12.5A1.5 1.5 0 0 1 14 5.9v5.6A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5zM8 7v4M6 9h4" />
  ),
  rename: <MenuIcon d="M10.7 3.3a1.6 1.6 0 0 1 2.3 2.3L6 12.6l-3 .7.7-3zM9.5 4.5l2.3 2.3" />,
  copy: <MenuIcon d="M5.5 5.5h7v7h-7zM10.5 5.5v-2h-7v7h2" />,
  scissors: <MenuIcon d="M5 3.5a2 2 0 1 1-1.4 3.4L7 10l-3.4 3.1A2 2 0 1 1 5 16.5M7 10l5.5-5M7 10l5.5 5" />,
  clipboard: <MenuIcon d="M6 2.5h4a1 1 0 0 1 1 1V4h1.5A1.5 1.5 0 0 1 14 5.5v7A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-7A1.5 1.5 0 0 1 3.5 4H5V3.5a1 1 0 0 1 1-1zM6 4h4" />,
  selectAll: <MenuIcon d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z" />,
  duplicate: <MenuIcon d="M4 2h5l3.5 3.5V14H4zM9 2v4h4M6.5 9.5h4M6.5 11.5h2.5" />,
  del: <MenuIcon d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5.2 13h5.6l.7-8.5M6.8 7v3.6M9.2 7v3.6" />,
  reveal: (
    <MenuIcon d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.7a1 1 0 0 1 .8.4l.7 1H12.5A1.5 1.5 0 0 1 14 5.9v5.6A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5zM8 7.2v3.6M8 7.2 6.6 8.6M8 7.2l1.4 1.4" />
  ),
  copyPath: <MenuIcon d="M4 2h5l3.5 3.5V14H4zM9 2v4h4M6 9h4M6 11h3" />,
  collapse: <MenuIcon d="M4 6.5 8 3l4 3.5M4 9.5 8 13l4-3.5" />,
  expand: <MenuIcon d="M4 3.5 8 7l4-3.5M4 9 8 12.5 12 9" />,
  refresh: <MenuIcon d="M13 8a5 5 0 1 1-1.5-3.6M13 2.8v2.4h-2.4" />,
  chat: (
    <MenuIcon d="M2.5 4.2A1.7 1.7 0 0 1 4.2 2.5h7.6a1.7 1.7 0 0 1 1.7 1.7v5a1.7 1.7 0 0 1-1.7 1.7H7l-2.8 2.4v-2.4H4.2a1.7 1.7 0 0 1-1.7-1.7z" />
  ),
  pin: <MenuIcon d="M6 2.5h4l-.6 4 2.1 2.5H4.5L6.6 6.5zM8 9v4.5" />,
  panel: <MenuIcon d="M2.5 3.5h11v9h-11zM10.5 3.5v9" />,
  close: <MenuIcon d="M4 4l8 8M12 4 4 12" />,
  closeRight: <MenuIcon d="M2.5 4h4.2v8H2.5zM8.8 8h4.7M11.2 5.8 13.5 8l-2.3 2.2" />,
  closeLeft: <MenuIcon d="M9.3 4h4.2v8H9.3zM7.2 8H2.5M4.8 5.8 2.5 8l2.3 2.2" />,
  closeAll: <MenuIcon d="M3 4.5h10M3 8h10M3 11.5h10" />,
};

function GitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2.5v11M5 5.5 8 2.5 11 5.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5.5 11.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function FileStartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4.5 2.5h5L12.5 5.5V13.5H4.5zM9.5 2.5V5.5h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export {
  FileGlyph,
  FileStartIcon,
  GitIcon,
  IconChevron,
  IconFolder,
  IconPanelHide,
  MI,
};
