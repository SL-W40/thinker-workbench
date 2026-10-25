/**
 * 生成文件 / 文件夹图标数据（数据源：material-icon-theme）。
 *
 * 上游清单由 `generateManifest()` 产出（VS Code 文件图标主题格式），SVG 原文件在包内 `icons/` 目录。
 * 这里只保留「清单里真正被引用到」的图标，把 SVG 压成内部片段（去掉外层 svg 壳、注释、多余空白），
 * 再解析成结构化节点树，生成两份 TS 数据供 renderer 直接内联渲染：
 *
 * - `bodies.ts`：图标 id -> 结构化节点树（viewBox 默认与覆盖表也在这里）
 * - `tables.ts`：文件名 / 扩展名 / 文件夹名映射，以及明暗主题覆盖表、自有族兜底表
 *
 * 之所以解析成节点而不是保留 SVG 字符串：字符串只能用 innerHTML 注入，浏览器要对每个图标跑一遍
 * HTML 解析器；文件树一次挂载几百个图标，这笔开销在切 tab / 打开文件时肉眼可见。
 *
 * 生成物提交进仓库，运行时零依赖、零网络请求（打包态是 Electron loadFile，外链资源不可靠）。
 *
 * 用法：`pnpm icons:gen`
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

/** 生成的 TS 数据目录（renderer 图标目录下的 material/generated）。 */
const OUT_DIR = path.resolve(
  import.meta.dirname,
  "../packages/renderer/src/ui/icons/material/generated",
);

/**
 * 清单生成配置：跟随上游默认值，但关掉图标包与文件夹箭头。
 * - `activeIconPack: "none"`：不引入 Angular / React 等框架专属图标，避免同一扩展名在不同包下变图标。
 * - `folders.theme: "specific"`：保留 src / node_modules / .git 等按文件夹名区分的图标。
 */
const MANIFEST_CONFIG = {
  activeIconPack: "none",
  hidesExplorerArrows: true,
  folders: { theme: "specific", associations: {} },
  files: { associations: {} },
  languages: { associations: {} },
};

/**
 * 自有族（glyphKind 的返回值）到 material 图标 id 的兜底候选，按顺序取第一个存在的。
 * material 清单不覆盖的规则（.env*、锁文件、私钥、复合扩展）靠这张表兜住。
 */
const KIND_FALLBACK_CANDIDATES = {
  ts: ["typescript"],
  js: ["javascript"],
  json: ["json"],
  md: ["markdown"],
  css: ["css"],
  html: ["html"],
  py: ["python"],
  sh: ["console", "shell", "bash"],
  go: ["go"],
  rs: ["rust"],
  java: ["java"],
  image: ["image"],
  audio: ["audio"],
  video: ["video"],
  font: ["font"],
  pdf: ["pdf"],
  zip: ["zip"],
  lock: ["lock"],
  config: ["settings", "config"],
  db: ["database"],
  key: ["key"],
  binary: ["binary"],
  git: ["git"],
  log: ["log"],
  text: ["file"],
};

/** 文件夹名的装饰别名（上游为每个名字都生成了 .x / _x_ / __x__ / -x 等变体）。 */
function folderVariants(name) {
  const out = [name];
  const push = (v) => {
    if (v && v !== name && !out.includes(v)) out.push(v);
  };
  push(name.replace(/^\.+/, ""));
  push(name.replace(/^__/, "").replace(/__$/, ""));
  push(name.replace(/^_+/, "").replace(/_+$/, ""));
  push(name.replace(/^-+/, ""));
  return out;
}

/** 读包内 package.json，取版本号写进生成物，便于回溯数据来源。 */
function readSourceVersion(pkgRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8"));
  return pkg.version;
}

/** 把 SVG 源文件压成「viewBox + 内部片段」：去掉 XML 声明、注释、外层 svg 壳与多余空白。 */
function slimSvg(source) {
  const cleaned = source
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  const open = cleaned.match(/<svg\b[^>]*>/i);
  if (!open) throw new Error("未找到 svg 开始标签");
  const viewBox = (open[0].match(/viewBox="([^"]+)"/i) || [])[1];
  if (!viewBox) throw new Error("未找到 viewBox");
  const body = cleaned
    .slice(open.index + open[0].length)
    .replace(/<\/svg\s*>\s*$/i, "")
    .replace(/>\s+</g, "><")
    .trim();
  return { viewBox, body };
}

/** 从 `<` 开始找到标签真正的 `>`（属性值里的 `>` 不算）。 */
function findTagEnd(src, start) {
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === ">") return i;
  }
  throw new Error(`标签没有闭合：${src.slice(start, start + 40)}`);
}

/** 解析标签里的属性，返回扁平的 [名, 值, 名, 值]。 */
function parseAttrs(src) {
  const out = [];
  const re = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m = re.exec(src);
  while (m) {
    out.push(m[1], m[2] !== undefined ? m[2] : m[3]);
    m = re.exec(src);
  }
  // 属性值里理论上也可能出现等号，这里严格比对，解析漏了属性会直接暴露而不是静默产出坏图标。
  const expected = (src.match(/=/g) || []).length;
  if (expected !== out.length / 2) {
    throw new Error(
      `属性解析不完整（应有 ${expected} 个，实得 ${out.length / 2} 个）：${src.slice(0, 60)}`,
    );
  }
  return out;
}

/**
 * 把 SVG 内部片段解析成结构化节点树。
 *
 * 片段是上游生成的固定子集：标签只有 path / circle / rect / g 这几个，属性是 fill / d 这类简单键值，
 * 所以不需要完整 XML 解析器。但解析结果会按标签数严格校验，解析不完整直接报错退出。
 */
function parseFragment(src) {
  const root = ["#root", [], []];
  const stack = [root];
  let i = 0;
  let tagCount = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) break;
    const text = src.slice(i, lt).trim();
    if (text) throw new Error(`图标片段含非标签内容：${text.slice(0, 40)}`);
    const gt = findTagEnd(src, lt);
    const raw = src.slice(lt + 1, gt).trim();
    i = gt + 1;
    if (raw.startsWith("/")) {
      const open = stack.pop();
      if (!open || open[0] !== raw.slice(1).trim()) {
        throw new Error(`闭合标签不匹配：${raw.slice(0, 40)}`);
      }
      continue;
    }
    tagCount++;
    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1).trim() : raw;
    const sp = body.search(/\s/);
    const tag = sp === -1 ? body : body.slice(0, sp);
    if (!/^[a-zA-Z][-\w:.]*$/.test(tag)) {
      throw new Error(`非法标签名：${body.slice(0, 40)}`);
    }
    const node = [tag, parseAttrs(sp === -1 ? "" : body.slice(sp)), []];
    stack[stack.length - 1][2].push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new Error(`标签未闭合：${stack[stack.length - 1][0]}`);
  return { nodes: root[2], tagCount };
}

/** 输出 TS 单引号字符串字面量（图标片段里双引号极多，单引号能少大量转义）。 */
function tsString(value) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** 输出一张 `Record<string, string>` 字面量。 */
function emitRecord(name, entries, indent = "\t") {
  const lines = entries.map(([k, v]) => `${indent}${tsString(k)}: ${tsString(v)},`);
  return `export const ${name}: Record<string, string> = {\n${lines.join("\n")}\n};\n`;
}

/** 输出一个字符串数组字面量。 */
function emitStrings(list) {
  return `[${list.map(tsString).join(",")}]`;
}

/** 输出一个结构化节点；末尾的空 attrs / children 直接省略，省体积。 */
function emitNode(node) {
  const [tag, attrs, children] = node;
  const parts = [tsString(tag)];
  if (children.length > 0) {
    parts.push(attrs.length > 0 ? emitStrings(attrs) : "[]");
    parts.push(`[${children.map(emitNode).join(",")}]`);
  } else if (attrs.length > 0) {
    parts.push(emitStrings(attrs));
  }
  return `[${parts.join(",")}]`;
}

/** 输出图标 id -> 节点树的表。 */
function emitElements(name, entries) {
  const lines = entries.map(
    ([k, nodes]) => `\t${tsString(k)}: [${nodes.map(emitNode).join(",")}],`,
  );
  return `export const ${name}: Record<string, readonly IconNode[]> = {\n${lines.join("\n")}\n};\n`;
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return Buffer.byteLength(content, "utf8");
}

function main() {
  // 该包只有 CJS 产物，用 createRequire 拿具名导出最稳（ESM 具名导入依赖静态分析，容易取不到）。
  const { generateManifest } = require("material-icon-theme");
  const distDir = path.dirname(require.resolve("material-icon-theme"));
  const pkgRoot = path.resolve(distDir, "../..");
  const version = readSourceVersion(pkgRoot);

  const manifest = generateManifest(MANIFEST_CONFIG);
  const { iconDefinitions, fileExtensions, fileNames, folderNames, light = {} } = manifest;

  // 1. 收集被清单实际引用到的图标 id（含明暗覆盖表里的 _light 变体）。
  const referenced = new Set();
  referenced.add(manifest.file);
  referenced.add(manifest.folder);
  referenced.add(manifest.folderExpanded);
  for (const table of [fileExtensions, fileNames, folderNames]) {
    for (const id of Object.values(table)) referenced.add(id);
  }
  for (const table of [light.fileExtensions, light.fileNames, light.folderNames]) {
    for (const id of Object.values(table || {})) referenced.add(id);
  }
  // 展开态文件夹图标是「折叠 id + -open」，也要一并收进来。
  for (const id of Object.values(folderNames)) referenced.add(`${id}-open`);

  const missing = [...referenced].filter((id) => !iconDefinitions[id]);
  if (missing.length > 0) {
    throw new Error(`清单引用了不存在的图标定义：${missing.slice(0, 10).join(", ")}`);
  }

  // 2. 读取并瘦身 SVG。iconPath 是相对于包内 dist 目录的路径（形如 ./../icons/x.svg）。
  const bodies = [];
  const viewBoxes = new Map();
  let nodeCount = 0;
  for (const id of [...referenced].sort()) {
    const iconPath = path.resolve(pkgRoot, "dist", iconDefinitions[id].iconPath);
    if (!fs.existsSync(iconPath)) throw new Error(`图标文件缺失：${iconPath}`);
    const { viewBox, body } = slimSvg(fs.readFileSync(iconPath, "utf8"));
    // 解析成结构化节点，并按标签数校验完整性：解析漏了会直接报错，不会静默产出坏图标。
    const { nodes, tagCount } = parseFragment(body);
    const sourceTags = (body.match(/<[a-zA-Z]/g) || []).length;
    if (tagCount !== sourceTags) {
      throw new Error(
        `图标 ${id} 解析不完整：片段里 ${sourceTags} 个标签，只解析出 ${tagCount} 个`,
      );
    }
    nodeCount += tagCount;
    bodies.push([id, nodes]);
    viewBoxes.set(id, viewBox);
  }

  // 3. 折叠文件夹表：上游给每个名字都生成了装饰别名（.x / _x_ / __x__ / -x），
  //    只保留「无法由更短的同图标名字推导出来」的键，运行时按同样规则反查。
  const folderEntries = Object.entries(folderNames).filter(([key, id]) => {
    return !folderVariants(key)
      .slice(1)
      .some((variant) => folderNames[variant] === id);
  });

  // 4. 自有族兜底表：按候选顺序取第一个存在的图标 id，取不到就回落到通用文件图标。
  const kindFallback = [];
  const kindMisses = [];
  for (const [kind, candidates] of Object.entries(KIND_FALLBACK_CANDIDATES)) {
    const hit = candidates.find((id) => referenced.has(id));
    if (hit) kindFallback.push([kind, hit]);
    else kindMisses.push(kind);
  }

  // 5. 写 bodies.ts：viewBox 取出现次数最多的作为默认值，其余单列，省一大半重复字符串。
  const viewBoxCount = new Map();
  for (const vb of viewBoxes.values()) viewBoxCount.set(vb, (viewBoxCount.get(vb) || 0) + 1);
  const defaultViewBox = [...viewBoxCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const viewBoxOverrides = [...viewBoxes.entries()]
    .filter(([, vb]) => vb !== defaultViewBox)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const header = `/**
 * 由 scripts/gen-file-icons.mjs 生成，请勿手改。
 * 数据来源：material-icon-theme@${version}（generateManifest + icons/）。
 * 需要更新时跑 \`pnpm icons:gen\`。
 */
// biome-ignore-all format: 生成物，格式化超大字面量没有意义
`;

  const bodiesFile = path.join(OUT_DIR, "bodies.ts");
  const bodiesBytes = writeFile(
    bodiesFile,
    `${header}
import type { IconNode } from "../iconNode";

/** 数据来源版本，测试用它校验生成物没有漏更新。 */
export const MATERIAL_SOURCE_VERSION = '${version}';

/** 绝大多数图标共用这个 viewBox，个别图标见 MATERIAL_ICON_VIEWBOXES。 */
export const MATERIAL_ICON_VIEWBOX_DEFAULT = ${tsString(defaultViewBox)};

/** 图标 id -> 结构化节点树（不含外层 svg 壳，渲染时套一层 svg 并带上 viewBox）。 */
${emitElements("MATERIAL_ICON_ELEMENTS", bodies)}
/** 少数图标的 viewBox 与默认值不同，这里单独记一份。 */
${emitRecord("MATERIAL_ICON_VIEWBOXES", viewBoxOverrides)}
`,
  );

  const tablesFile = path.join(OUT_DIR, "tables.ts");
  const tablesBytes = writeFile(
    tablesFile,
    `${header}
/** 通用文件图标（任何名字都没命中时的兜底）。 */
export const MATERIAL_FILE_DEFAULT = ${tsString(manifest.file)};

/** 通用文件夹图标（折叠 / 展开）。 */
export const MATERIAL_FOLDER = ${tsString(manifest.folder)};
export const MATERIAL_FOLDER_OPEN = ${tsString(manifest.folderExpanded)};

/** 整文件名 -> 图标 id（优先级最高，如 package.json / dockerfile / readme.md）。 */
${emitRecord(
  "MATERIAL_FILE_NAMES",
  Object.entries(fileNames).sort((a, b) => a[0].localeCompare(b[0])),
)}

/** 扩展名 -> 图标 id。键可能是复合扩展（如 d.ts / min.js / tar.gz），匹配时取最长后缀。 */
${emitRecord(
  "MATERIAL_FILE_EXTENSIONS",
  Object.entries(fileExtensions).sort((a, b) => a[0].localeCompare(b[0])),
)}

/** 文件夹名 -> 图标 id。装饰别名（.x / _x_ / __x__ / -x）已被折叠，运行时按同规则反查。 */
${emitRecord(
  "MATERIAL_FOLDER_NAMES",
  folderEntries.sort((a, b) => a[0].localeCompare(b[0])),
)}

/** 亮色主题下与暗色不同的图标（稀疏覆盖：先查这张表，查不到再用上面的暗色表）。 */
${emitRecord(
  "MATERIAL_LIGHT_FILE_NAMES",
  Object.entries(light.fileNames || {}).sort((a, b) => a[0].localeCompare(b[0])),
)}
${emitRecord(
  "MATERIAL_LIGHT_FILE_EXTENSIONS",
  Object.entries(light.fileExtensions || {}).sort((a, b) => a[0].localeCompare(b[0])),
)}
${emitRecord(
  "MATERIAL_LIGHT_FOLDER_NAMES",
  Object.entries(light.folderNames || {}).sort((a, b) => a[0].localeCompare(b[0])),
)}

/** 自有族（glyphKind 的返回值）-> material 图标 id，用于 material 清单没覆盖的规则兜底。 */
${emitRecord("MATERIAL_KIND_FALLBACK", kindFallback)}
`,
  );

  const total = bodiesBytes + tablesBytes;
  console.log(`material-icon-theme@${version}`);
  console.log(
    `  icons  ${bodies.length} 个（清单共 ${Object.keys(iconDefinitions).length} 个定义，裁剪掉 ${Object.keys(iconDefinitions).length - bodies.length} 个）`,
  );
  console.log(`  viewBox 默认 ${defaultViewBox}，单独覆盖 ${viewBoxOverrides.length} 个`);
  console.log(
    `  解析出 ${nodeCount} 个标签节点（平均 ${(nodeCount / bodies.length).toFixed(1)} 个/图标）`,
  );
  console.log(
    `  fileNames ${Object.keys(fileNames).length}，fileExtensions ${Object.keys(fileExtensions).length}`,
  );
  console.log(`  folderNames ${Object.keys(folderNames).length} -> 折叠后 ${folderEntries.length}`);
  console.log(
    `  kind 兜底 ${kindFallback.length} 个${kindMisses.length > 0 ? `，未命中：${kindMisses.join(", ")}` : ""}`,
  );
  console.log(
    `  bodies.ts ${(bodiesBytes / 1024).toFixed(0)} KB，tables.ts ${(tablesBytes / 1024).toFixed(0)} KB，合计 ${(total / 1024).toFixed(0)} KB`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    `[gen-file-icons] 生成失败：${error instanceof Error ? error.stack : String(error)}`,
  );
  process.exit(1);
}
