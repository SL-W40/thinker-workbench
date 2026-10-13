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
  | "audio"
  | "video"
  | "font"
  | "pdf"
  | "zip"
  | "lock"
  | "config"
  | "db"
  | "key"
  | "binary"
  | "git"
  | "log"
  | "text";

/** 扩展名 → 图标族（同族共用一枚 SVG；覆盖常见开发 / 文档 / 媒体类型）。 */
const EXT_GLYPH: Record<string, FileGlyphKind> = {
  // TypeScript / JavaScript
  ts: "ts",
  tsx: "ts",
  mts: "ts",
  cts: "ts",
  js: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  // 数据交换
  json: "json",
  jsonc: "json",
  json5: "json",
  geojson: "json",
  har: "json",
  // 文档 / 标记
  md: "md",
  mdx: "md",
  markdown: "md",
  rst: "md",
  adoc: "md",
  asciidoc: "md",
  org: "md",
  tex: "md",
  latex: "md",
  rtf: "text",
  txt: "text",
  text: "text",
  csv: "text",
  tsv: "text",
  nfo: "text",
  // 样式
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  styl: "css",
  stylus: "css",
  pcss: "css",
  // 标记 / 前端框架
  html: "html",
  htm: "html",
  xhtml: "html",
  vue: "html",
  svelte: "html",
  astro: "html",
  php: "html",
  phtml: "html",
  jsp: "html",
  asp: "html",
  aspx: "html",
  ejs: "html",
  hbs: "html",
  handlebars: "html",
  mustache: "html",
  njk: "html",
  nunjucks: "html",
  pug: "html",
  jade: "html",
  twig: "html",
  liquid: "html",
  // Python / 脚本语言族
  py: "py",
  pyw: "py",
  pyi: "py",
  pyx: "py",
  pxd: "py",
  rb: "py",
  erb: "py",
  rake: "py",
  gemspec: "py",
  pl: "py",
  pm: "py",
  t: "py",
  lua: "py",
  r: "py",
  jl: "py",
  elm: "py",
  ex: "py",
  exs: "py",
  erl: "py",
  hrl: "py",
  clj: "py",
  cljs: "py",
  cljc: "py",
  edn: "py",
  hs: "py",
  lhs: "py",
  ml: "py",
  mli: "py",
  fs: "java",
  fsi: "java",
  fsx: "java",
  fsscript: "java",
  // Shell / 自动化
  sh: "sh",
  bash: "sh",
  zsh: "sh",
  fish: "sh",
  ksh: "sh",
  csh: "sh",
  tcsh: "sh",
  ps1: "sh",
  psm1: "sh",
  psd1: "sh",
  bat: "sh",
  cmd: "sh",
  // Go / Rust
  go: "go",
  rs: "rs",
  // JVM / .NET / 类似
  java: "java",
  jav: "java",
  class: "binary",
  jar: "zip",
  war: "zip",
  ear: "zip",
  kt: "java",
  kts: "java",
  ktm: "java",
  scala: "java",
  sc: "java",
  groovy: "java",
  gvy: "java",
  gradle: "config",
  cs: "java",
  csx: "java",
  vb: "java",
  vbs: "sh",
  // C / C++ / ObjC / Swift（尖括号族）
  c: "ts",
  h: "ts",
  cc: "ts",
  cpp: "ts",
  cxx: "ts",
  cplusplus: "ts",
  hpp: "ts",
  hxx: "ts",
  hh: "ts",
  inl: "ts",
  ipp: "ts",
  tpp: "ts",
  ixx: "ts",
  mmm: "ts",
  m: "ts",
  mm: "ts",
  swift: "ts",
  // 图像
  png: "image",
  jpg: "image",
  jpeg: "image",
  jpe: "image",
  jfif: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  svgz: "image",
  ico: "image",
  icns: "image",
  avif: "image",
  bmp: "image",
  dib: "image",
  tif: "image",
  tiff: "image",
  heic: "image",
  heif: "image",
  raw: "image",
  cr2: "image",
  nef: "image",
  orf: "image",
  sr2: "image",
  psd: "image",
  ai: "image",
  eps: "image",
  sketch: "image",
  fig: "image",
  xd: "image",
  // 音频
  mp3: "audio",
  wav: "audio",
  flac: "audio",
  aac: "audio",
  m4a: "audio",
  ogg: "audio",
  oga: "audio",
  opus: "audio",
  wma: "audio",
  aiff: "audio",
  aif: "audio",
  mid: "audio",
  midi: "audio",
  // 视频
  mp4: "video",
  m4v: "video",
  mov: "video",
  mkv: "video",
  webm: "video",
  avi: "video",
  wmv: "video",
  flv: "video",
  mpeg: "video",
  mpg: "video",
  m2ts: "video",
  "3gp": "video",
  ogv: "video",
  // 字体
  ttf: "font",
  otf: "font",
  woff: "font",
  woff2: "font",
  eot: "font",
  fon: "font",
  pfb: "font",
  // 文档
  pdf: "pdf",
  doc: "pdf",
  docx: "pdf",
  odt: "pdf",
  pages: "pdf",
  epub: "pdf",
  mobi: "pdf",
  ppt: "pdf",
  pptx: "pdf",
  odp: "pdf",
  keynote: "pdf",
  xls: "db",
  xlsx: "db",
  ods: "db",
  numbers: "db",
  // 压缩包
  zip: "zip",
  tar: "zip",
  gz: "zip",
  tgz: "zip",
  bz2: "zip",
  bz: "zip",
  xz: "zip",
  lz: "zip",
  lz4: "zip",
  zst: "zip",
  zstd: "zip",
  rar: "zip",
  "7z": "zip",
  cab: "zip",
  iso: "zip",
  dmg: "zip",
  pkg: "zip",
  deb: "zip",
  rpm: "zip",
  apk: "zip",
  ipa: "zip",
  // 锁文件扩展
  lock: "lock",
  // 配置
  yml: "config",
  yaml: "config",
  toml: "config",
  ini: "config",
  env: "config",
  conf: "config",
  cfg: "config",
  cnf: "config",
  properties: "config",
  prop: "config",
  xml: "config",
  xsd: "config",
  xsl: "config",
  xslt: "config",
  dtd: "config",
  plist: "config",
  graphql: "config",
  gql: "config",
  proto: "config",
  protobuf: "config",
  avsc: "config",
  thrift: "config",
  reg: "config",
  desktop: "config",
  service: "config",
  npmrc: "config",
  babelrc: "config",
  eslintrc: "config",
  prettierrc: "config",
  stylelintrc: "config",
  gitconfig: "git",
  gitignore: "git",
  gitattributes: "git",
  gitmodules: "git",
  editorconfig: "config",
  // 数据库 / 查询
  sql: "db",
  mysql: "db",
  pgsql: "db",
  psql: "db",
  plsql: "db",
  sqlite: "db",
  sqlite3: "db",
  db: "db",
  mdb: "db",
  accdb: "db",
  prisma: "db",
  cql: "db",
  hql: "db",
  // 密钥 / 证书
  pem: "key",
  crt: "key",
  cer: "key",
  der: "key",
  p12: "key",
  pfx: "key",
  p7b: "key",
  p7c: "key",
  csr: "key",
  pub: "key",
  gpg: "key",
  asc: "key",
  // 二进制 / 原生
  exe: "binary",
  dll: "binary",
  so: "binary",
  dylib: "binary",
  a: "binary",
  lib: "binary",
  o: "binary",
  obj: "binary",
  wasm: "binary",
  bin: "binary",
  dat: "binary",
  pak: "binary",
  node: "binary",
  pyc: "binary",
  pyo: "binary",
  bean: "binary",
  // 日志 / 地图
  log: "log",
  out: "log",
  err: "log",
  map: "json",
  // 其他常见
  diff: "git",
  patch: "git",
  nifti: "binary",
  ics: "text",
  vcf: "text",
  eml: "text",
  msg: "text",
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
  audio: "#6b7fd7",
  video: "#c45c8a",
  font: "#8b6bb5",
  pdf: "#c23b3b",
  zip: "#96742f",
  lock: "#8a8a84",
  config: "#8a6d3b",
  db: "#3d8f8a",
  key: "#c9a227",
  binary: "#7a7a74",
  git: "#f05032",
  log: "#9a9a94",
  text: "#9a9a94",
};

/** 整文件名（小写）优先于扩展名。 */
const SPECIAL_NAME_GLYPH: Record<string, FileGlyphKind> = {
  // 构建 / 容器
  dockerfile: "sh",
  containerfile: "sh",
  makefile: "sh",
  gnumakefile: "sh",
  rakefile: "sh",
  gemfile: "py",
  "gemfile.lock": "lock",
  procfile: "sh",
  vagrantfile: "sh",
  brewfile: "sh",
  justfile: "sh",
  "cmakelists.txt": "config",
  "docker-compose.yml": "config",
  "docker-compose.yaml": "config",
  "compose.yml": "config",
  "compose.yaml": "config",
  // Node / JS 生态
  "package.json": "json",
  "package-lock.json": "lock",
  "npm-shrinkwrap.json": "lock",
  "pnpm-lock.yaml": "lock",
  "yarn.lock": "lock",
  "bun.lock": "lock",
  "bun.lockb": "lock",
  "deno.lock": "lock",
  "tsconfig.json": "ts",
  "jsconfig.json": "js",
  "turbo.json": "json",
  "nx.json": "json",
  "lerna.json": "json",
  "vercel.json": "json",
  "netlify.toml": "config",
  "wrangler.toml": "config",
  "firebase.json": "json",
  "angular.json": "json",
  "ionic.config.json": "json",
  "capacitor.config.json": "json",
  "capacitor.config.ts": "ts",
  "next.config.js": "js",
  "next.config.mjs": "js",
  "next.config.ts": "ts",
  "nuxt.config.js": "js",
  "nuxt.config.ts": "ts",
  "vite.config.js": "js",
  "vite.config.mjs": "js",
  "vite.config.ts": "ts",
  "vitest.config.ts": "ts",
  "vitest.config.js": "js",
  "webpack.config.js": "js",
  "rollup.config.js": "js",
  "rollup.config.mjs": "js",
  "esbuild.config.js": "js",
  "jest.config.js": "js",
  "jest.config.ts": "ts",
  "jest.config.cjs": "js",
  "babel.config.js": "js",
  "babel.config.json": "json",
  "tailwind.config.js": "js",
  "tailwind.config.ts": "ts",
  "postcss.config.js": "js",
  "postcss.config.cjs": "js",
  "prettier.config.js": "js",
  "prettier.config.cjs": "js",
  "eslint.config.js": "js",
  "eslint.config.mjs": "js",
  "eslint.config.cjs": "js",
  "eslint.config.ts": "ts",
  "biome.json": "json",
  "biome.jsonc": "json",
  ".babelrc": "config",
  ".babelrc.js": "js",
  ".babelrc.json": "json",
  ".npmrc": "config",
  ".nvmrc": "config",
  ".node-version": "config",
  ".yarnrc": "config",
  ".yarnrc.yml": "config",
  ".pnpmfile.cjs": "js",
  ".editorconfig": "config",
  ".prettierrc": "config",
  ".prettierrc.js": "js",
  ".prettierrc.cjs": "js",
  ".prettierrc.json": "json",
  ".prettierrc.yml": "config",
  ".prettierrc.yaml": "config",
  ".prettierignore": "config",
  ".eslintrc": "config",
  ".eslintrc.js": "js",
  ".eslintrc.cjs": "js",
  ".eslintrc.json": "json",
  ".eslintrc.yml": "config",
  ".eslintignore": "config",
  ".stylelintrc": "config",
  ".stylelintrc.json": "json",
  ".stylelintignore": "config",
  ".dockerignore": "config",
  ".gitignore": "git",
  ".gitattributes": "git",
  ".gitmodules": "git",
  ".gitkeep": "git",
  ".keep": "git",
  ".mailmap": "git",
  ".hgignore": "git",
  ".cvsignore": "git",
  // 环境变量
  ".env": "config",
  ".env.local": "config",
  ".env.development": "config",
  ".env.development.local": "config",
  ".env.test": "config",
  ".env.test.local": "config",
  ".env.production": "config",
  ".env.production.local": "config",
  ".env.example": "config",
  ".env.sample": "config",
  // Go / Rust / 其他锁与清单
  "go.mod": "go",
  "go.sum": "lock",
  "cargo.toml": "rs",
  "cargo.lock": "lock",
  "rust-toolchain": "rs",
  "rust-toolchain.toml": "rs",
  "composer.json": "json",
  "composer.lock": "lock",
  pipfile: "py",
  "pipfile.lock": "lock",
  "poetry.lock": "lock",
  "pyproject.toml": "py",
  "requirements.txt": "py",
  "requirements-dev.txt": "py",
  "setup.py": "py",
  "setup.cfg": "config",
  "tox.ini": "config",
  "manifest.in": "config",
  podfile: "config",
  "podfile.lock": "lock",
  "pubspec.yaml": "config",
  "pubspec.lock": "lock",
  "mix.exs": "py",
  "mix.lock": "lock",
  "build.gradle": "config",
  "build.gradle.kts": "config",
  "settings.gradle": "config",
  "settings.gradle.kts": "config",
  "pom.xml": "config",
  "build.sbt": "config",
  "project.clj": "py",
  "deps.edn": "py",
  "package.swift": "ts",
  cartfile: "config",
  "cartfile.resolved": "lock",
  // CI / 云
  jenkinsfile: "sh",
  "azure-pipelines.yml": "config",
  "azure-pipelines.yaml": "config",
  "buildkite.yml": "config",
  "cloudbuild.yaml": "config",
  "appveyor.yml": "config",
  // 文档 / 许可
  license: "text",
  licence: "text",
  copying: "text",
  authors: "text",
  contributors: "text",
  changelog: "md",
  changes: "md",
  history: "md",
  news: "md",
  todo: "md",
  readme: "md",
  "readme.md": "md",
  "readme.mdx": "md",
  "readme.txt": "md",
  "readme.rst": "md",
  codeowners: "git",
  "security.md": "md",
  "contributing.md": "md",
  "authors.md": "md",
  "changelog.md": "md",
  "license.md": "text",
  "licence.md": "text",
  // 编辑器 / IDE 工程文件
  ".project": "config",
  ".classpath": "config",
  // Shell 启动
  ".bashrc": "sh",
  ".bash_profile": "sh",
  ".bash_logout": "sh",
  ".zshrc": "sh",
  ".zprofile": "sh",
  ".zshenv": "sh",
  ".profile": "sh",
  ".zlogin": "sh",
  ".inputrc": "config",
  ".tmux.conf": "config",
  ".vimrc": "config",
  ".gvimrc": "config",
  ".nanorc": "config",
};

/** 复合扩展（从右取最长匹配）→ 图标族。 */
const COMPOUND_EXT_GLYPH: Record<string, FileGlyphKind> = {
  "d.ts": "ts",
  "d.mts": "ts",
  "d.cts": "ts",
  "test.ts": "ts",
  "test.tsx": "ts",
  "test.js": "js",
  "test.jsx": "js",
  "test.mjs": "js",
  "spec.ts": "ts",
  "spec.tsx": "ts",
  "spec.js": "js",
  "spec.jsx": "js",
  "stories.tsx": "ts",
  "stories.ts": "ts",
  "stories.jsx": "js",
  "stories.js": "js",
  "module.ts": "ts",
  "module.js": "js",
  "config.ts": "ts",
  "config.js": "js",
  "config.mjs": "js",
  "config.cjs": "js",
  "tar.gz": "zip",
  "tar.bz2": "zip",
  "tar.xz": "zip",
  "tar.zst": "zip",
  "user.js": "js",
  "min.js": "js",
  "min.css": "css",
  "min.map": "json",
  "js.map": "json",
  "css.map": "json",
};

function glyphKind(name: string): FileGlyphKind {
  const base = name.replace(/\\/g, "/").split("/").pop() || name;
  const lower = base.toLowerCase();
  if (SPECIAL_NAME_GLYPH[lower]) return SPECIAL_NAME_GLYPH[lower];
  // Dockerfile.* / Containerfile.*
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return "sh";
  if (lower === "containerfile" || lower.startsWith("containerfile.")) return "sh";
  if (lower.startsWith(".env")) return "config";
  if (lower.endsWith(".lock") || lower.endsWith(".lockb")) return "lock";
  // 私钥常见无扩展或 .key
  if (lower === "id_rsa" || lower === "id_ed25519" || lower === "id_ecdsa") return "key";
  if (lower.endsWith(".key") && !lower.endsWith(".keystore")) return "key";

  for (const [compound, kind] of Object.entries(COMPOUND_EXT_GLYPH)) {
    if (lower.endsWith(`.${compound}`)) return kind;
  }

  const dot = lower.lastIndexOf(".");
  const ext = dot > 0 ? lower.slice(dot + 1) : "";
  if (!ext) {
    // 无扩展常见脚本 / 文档名
    if (lower === "makefile" || lower === "justfile") return "sh";
    return "text";
  }
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
    case "audio":
      return (
        <svg {...common}>
          <path d="M6 4.2v7.6M6 4.2c2.2-.8 4-.4 4 .8v2.2c0 1.2-1.8.8-4 0" />
          <circle cx="5.2" cy="11.4" r="1.4" />
        </svg>
      );
    case "video":
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="8.5" height="8" rx="1.4" />
          <path d="m11 6.2 2.5-1.4v6.4L11 9.8z" />
        </svg>
      );
    case "font":
      return (
        <svg {...common}>
          <path d="M4 12.2 7.2 3.8h1.6L12 12.2M5.2 9.4h5.6" />
        </svg>
      );
    case "db":
      return (
        <svg {...common}>
          <ellipse cx="8" cy="4.2" rx="4.5" ry="1.6" />
          <path d="M3.5 4.2v7.6c0 .9 2 1.6 4.5 1.6s4.5-.7 4.5-1.6V4.2" />
          <path d="M3.5 8c0 .9 2 1.6 4.5 1.6s4.5-.7 4.5-1.6" />
        </svg>
      );
    case "key":
      return (
        <svg {...common}>
          <circle cx="6" cy="8" r="2.4" />
          <path d="M8.2 8h5.3M11.2 8v1.8M12.8 8v1.2" />
        </svg>
      );
    case "binary":
      return (
        <svg {...common}>
          <path d="M4 2h5l3.5 3.5V14H4zM9 2v4h4" />
          <path d="M6.2 9.2h1.2M8.6 9.2h1.2M6.2 11.2h1.2M8.6 11.2h1.2" />
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
  scissors: (
    <MenuIcon d="M5 3.5a2 2 0 1 1-1.4 3.4L7 10l-3.4 3.1A2 2 0 1 1 5 16.5M7 10l5.5-5M7 10l5.5 5" />
  ),
  clipboard: (
    <MenuIcon d="M6 2.5h4a1 1 0 0 1 1 1V4h1.5A1.5 1.5 0 0 1 14 5.5v7A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-7A1.5 1.5 0 0 1 3.5 4H5V3.5a1 1 0 0 1 1-1zM6 4h4" />
  ),
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

function TerminalStartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5 6.5 7 8.5 5 10.5M8.5 10.5h2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrowserStartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M2.5 8h11M8 2.5c1.5 1.8 2.2 3.6 2.2 5.5S9.5 11.7 8 13.5C6.5 11.7 5.8 9.9 5.8 8S6.5 4.3 8 2.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 子代理 Task 时间线 tab。 */
function SubagentStartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4" cy="11.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="11.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7.2 6.2 4.8 9.3M8.8 6.2l2.4 3.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export {
  BrowserStartIcon,
  FileGlyph,
  FileStartIcon,
  GitIcon,
  IconChevron,
  IconFolder,
  IconPanelHide,
  MI,
  SubagentStartIcon,
  TerminalStartIcon,
};
