/**
 * 文件 / 文件夹图标：先按文件名规则定族，再按族取色。
 */
// biome-ignore-all lint/a11y/noSvgWithoutTitle: 本文件是纯装饰性图标集合，svg 全部 aria-hidden，不承载语义，无需 title
import {
  COMPOUND_EXT_GLYPH,
  EXT_GLYPH,
  type FileGlyphKind,
  GLYPH_COLOR,
  SPECIAL_NAME_GLYPH,
} from "./glyphTables";

export function IconFolder({ open }: { open?: boolean }) {
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

export function glyphKind(name: string): FileGlyphKind {
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

/** 图标的原子形状。React 与纯 DOM 两侧共用同一份形状数据，避免两处实现漂移。 */
type GlyphShape =
  | { t: "path"; d: string }
  | { t: "circle"; cx: number; cy: number; r: number; solid?: boolean }
  | { t: "rect"; x: number; y: number; w: number; h: number; rx: number }
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number };

const GLYPH_SHAPES: Record<FileGlyphKind, GlyphShape[]> = {
  ts: [{ t: "path", d: "M5.6 5 3 8l2.6 3M10.4 5 13 8l-2.6 3" }],
  js: [{ t: "path", d: "M5.6 5 3 8l2.6 3M10.4 5 13 8l-2.6 3" }],
  json: [
    {
      t: "path",
      d: "M6 2.8c-1.1 0-1.5.6-1.5 1.6v1.2c0 .9-.5 1.4-1.3 1.5v.8c.8.1 1.3.6 1.3 1.5v1.2c0 1 .4 1.6 1.5 1.6M10 2.8c1.1 0 1.5.6 1.5 1.6v1.2c0 .9.5 1.4 1.3 1.5v.8c-.8.1-1.3.6-1.3 1.5v1.2c0 1-.4 1.6-1.5 1.6",
    },
  ],
  md: [
    { t: "path", d: "M2.5 4.5h11v7h-11z" },
    {
      t: "path",
      d: "M4.5 9.5v-3l1.6 1.8 1.6-1.8v3M10.4 6.5v3M10.4 9.5l-1.2-1.2M10.4 9.5l1.2-1.2",
    },
  ],
  css: [
    { t: "path", d: "M8 2.6 3.4 4.2l.7 6.2L8 13.4l3.9-3 .7-6.2z" },
    { t: "path", d: "M8 6.2v3.4" },
  ],
  html: [
    { t: "path", d: "M3 3.5h10l-.9 9.2L8 14l-4.1-1.3z" },
    { t: "path", d: "m6.4 6.6-1.2 1.9 1.2 1.9M9.6 6.6l1.2 1.9-1.2 1.9" },
  ],
  py: [
    {
      t: "path",
      d: "M8 2.5c-2 0-2.6.9-2.6 2v1.3h2.9v.5H4.4c-1.2 0-2 .9-2 2.4s.8 2.4 2 2.4h1v-1.6c0-1.2 1-2.1 2.2-2.1",
    },
    { t: "path", d: "M8 13.5c2 0 2.6-.9 2.6-2v-1.3H7.7v-.5h3.9c1.2 0 2-.9 2-2.4" },
    { t: "path", d: "M6.6 4.2h.01M9.4 11.8h.01" },
  ],
  sh: [
    { t: "rect", x: 2.5, y: 3.5, w: 11, h: 9, rx: 1.6 },
    { t: "path", d: "m5 6.6 2 1.7-2 1.7M8.6 10.2h2.6" },
  ],
  go: [
    {
      t: "path",
      d: "M3.2 6.2h9.6c.7 0 1.2.6 1 1.2l-.7 2.4c-.2.6-.8 1-1.4 1H5.3c-.6 0-1.2-.4-1.4-1l-.7-2.4c-.2-.6.3-1.2 1-1.2z",
    },
    { t: "path", d: "M6.2 5.2c0-.8.6-1.4 1.3-1.4h.7c.7 0 1.3.6 1.3 1.4" },
    { t: "circle", cx: 6.4, cy: 8.2, r: 0.55, solid: true },
    { t: "circle", cx: 9.6, cy: 8.2, r: 0.55, solid: true },
  ],
  rs: [
    { t: "circle", cx: 8, cy: 8, r: 5.2 },
    { t: "circle", cx: 8, cy: 8, r: 1.4 },
    {
      t: "path",
      d: "M8 2.8v1.4M8 11.8v1.4M2.8 8h1.4M11.8 8h1.4M4.3 4.3l1 1M10.7 10.7l1 1M11.7 4.3l-1 1M5.3 10.7l-1 1",
    },
  ],
  java: [
    { t: "path", d: "M5.2 9.6c2.8 1.5 5.6.4 6.4-.6M4.8 11.2c3.4 1.8 7 .2 7.6-1" },
    { t: "path", d: "M8.6 8.2c-.2-1.6 1.1-2.6 1.1-3.7 0-1.1-.8-1.6-1.7-1.6" },
    { t: "path", d: "M7.2 8.6c0-1.8 1.4-2.5 1.4-4" },
  ],
  image: [
    { t: "rect", x: 2.5, y: 3.5, w: 11, h: 9, rx: 1.6 },
    { t: "circle", cx: 6, cy: 6.7, r: 1 },
    { t: "path", d: "m3.6 11.2 2.8-2.8 2.3 2.3 1.8-1.8 1.9 1.9" },
  ],
  audio: [
    { t: "path", d: "M6 4.2v7.6M6 4.2c2.2-.8 4-.4 4 .8v2.2c0 1.2-1.8.8-4 0" },
    { t: "circle", cx: 5.2, cy: 11.4, r: 1.4 },
  ],
  video: [
    { t: "rect", x: 2.5, y: 4, w: 8.5, h: 8, rx: 1.4 },
    { t: "path", d: "m11 6.2 2.5-1.4v6.4L11 9.8z" },
  ],
  font: [{ t: "path", d: "M4 12.2 7.2 3.8h1.6L12 12.2M5.2 9.4h5.6" }],
  pdf: [
    { t: "path", d: "M4 2h5l3.5 3.5V14H4zM9 2v4h4" },
    {
      t: "path",
      d: "M6 9.2h1.1a1 1 0 0 1 0 2H6zM6 9.2V12M9.4 12V9.2h.9a1.4 1 0 0 1 0 2.8h-.9",
    },
  ],
  zip: [
    { t: "path", d: "M4 2h5l3.5 3.5V14H4zM9 2v4h4" },
    { t: "path", d: "M7 3.2v.9M8 4.6v.9M7 6v.9M8 7.4v.9M7.4 9h1.2v1.8H7.4z" },
  ],
  lock: [
    { t: "rect", x: 4, y: 7, w: 8, h: 6, rx: 1.4 },
    { t: "path", d: "M6 7V5.4a2 2 0 0 1 4 0V7M8 9.4v1.4" },
  ],
  config: [
    { t: "circle", cx: 8, cy: 8, r: 2.1 },
    {
      t: "path",
      d: "M8 2.6v1.8M8 11.6v1.8M2.6 8h1.8M11.6 8h1.8M4.3 4.3l1.3 1.3M10.4 10.4l1.3 1.3M11.7 4.3l-1.3 1.3M5.6 10.4l-1.3 1.3",
    },
  ],
  db: [
    { t: "ellipse", cx: 8, cy: 4.2, rx: 4.5, ry: 1.6 },
    { t: "path", d: "M3.5 4.2v7.6c0 .9 2 1.6 4.5 1.6s4.5-.7 4.5-1.6V4.2" },
    { t: "path", d: "M3.5 8c0 .9 2 1.6 4.5 1.6s4.5-.7 4.5-1.6" },
  ],
  key: [
    { t: "circle", cx: 6, cy: 8, r: 2.4 },
    { t: "path", d: "M8.2 8h5.3M11.2 8v1.8M12.8 8v1.2" },
  ],
  binary: [
    { t: "path", d: "M4 2h5l3.5 3.5V14H4zM9 2v4h4" },
    { t: "path", d: "M6.2 9.2h1.2M8.6 9.2h1.2M6.2 11.2h1.2M8.6 11.2h1.2" },
  ],
  git: [
    { t: "circle", cx: 4.2, cy: 11, r: 1.5 },
    { t: "circle", cx: 11.8, cy: 11, r: 1.5 },
    { t: "circle", cx: 8, cy: 4.2, r: 1.5 },
    { t: "path", d: "M4.2 9.5V7.2L8 4.8M11.8 9.5V7.2L8 4.8" },
  ],
  log: [{ t: "path", d: "M3.5 4.5h9M3.5 8h9M3.5 11.5h5.5" }],
  text: [
    { t: "path", d: "M4 2h5l3.5 3.5V14H4zM9 2v4h4" },
    { t: "path", d: "M6 9h4M6 11h3" },
  ],
};

/** 形状内容即身份，用作稳定 key（图标形状是静态表，无需担心顺序变化）。 */
function shapeKey(shape: GlyphShape): string {
  switch (shape.t) {
    case "path":
      return `p:${shape.d}`;
    case "circle":
      return `c:${shape.cx},${shape.cy},${shape.r}`;
    case "rect":
      return `r:${shape.x},${shape.y},${shape.w},${shape.h}`;
    case "ellipse":
      return `e:${shape.cx},${shape.cy},${shape.rx},${shape.ry}`;
  }
}

function GlyphShapes({ shapes, color }: { shapes: GlyphShape[]; color: string }) {
  return (
    <>
      {shapes.map((s) => {
        const key = shapeKey(s);
        if (s.t === "path") return <path key={key} d={s.d} />;
        if (s.t === "circle") {
          return s.solid ? (
            <circle key={key} cx={s.cx} cy={s.cy} r={s.r} fill={color} stroke="none" />
          ) : (
            <circle key={key} cx={s.cx} cy={s.cy} r={s.r} />
          );
        }
        if (s.t === "rect") {
          return <rect key={key} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} />;
        }
        return <ellipse key={key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />;
      })}
    </>
  );
}

/** 按扩展名着色/变形的文件图标（React）。 */
export function FileGlyph({ name }: { name: string }) {
  const kind = glyphKind(name);
  const color = GLYPH_COLOR[kind];
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <GlyphShapes shapes={GLYPH_SHAPES[kind]} color={color} />
    </svg>
  );
}

function shapeMarkup(shape: GlyphShape, color: string): string {
  if (shape.t === "path") return `<path d="${shape.d}"/>`;
  if (shape.t === "circle") {
    const fill = shape.solid ? ` fill="${color}" stroke="none"` : "";
    return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"${fill}/>`;
  }
  if (shape.t === "rect") {
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.rx}"/>`;
  }
  return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}"/>`;
}

/**
 * 同一图标的 SVG 字符串版本，供纯 DOM 场景使用
 * （如 composer contentEditable 内手工构造的 mention 芯片，无法渲染 React 组件）。
 */
export function fileGlyphMarkup(name: string): string {
  const kind = glyphKind(name);
  const color = GLYPH_COLOR[kind];
  const body = GLYPH_SHAPES[kind].map((shape) => shapeMarkup(shape, color)).join("");
  return `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
