/**
 * 加载 `@thinker-workbench/design` 各控件目录下的说明 Markdown（Vite ?raw）。
 */
const modules = import.meta.glob("../../../../design/src/components/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, unknown>;

/** 控件目录名 → Markdown 正文。 */
const byName = new Map<string, string>();

for (const [filePath, raw] of Object.entries(modules)) {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/\/components\/([^/]+)\/\1\.md$/);
  if (!match?.[1]) continue;
  // Vite ?raw 一般为 string；兜底避免非字符串进解析器
  const markdown = typeof raw === "string" ? raw : String(raw ?? "");
  byName.set(match[1], markdown);
}

/** 读取组件说明文档；缺失时返回简短占位。 */
export function getComponentDoc(name: string): string {
  return (
    byName.get(name) ??
    `# ${name}\n\n暂无说明文档。请在 \`packages/design/src/components/${name}/${name}.md\` 补充。\n`
  );
}

/** 已扫描到的组件文档名（调试 / 目录用）。 */
export function listComponentDocNames(): string[] {
  return [...byName.keys()].sort();
}
