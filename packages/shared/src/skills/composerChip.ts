/**
 * 面板选中的 mention 芯片线格式：token 末尾紧跟零宽空格。
 * 手打 `/name`、`@path` 不含此标记 → 发出去仍是字面量（与 Cursor 一致）。
 */
export const COMPOSER_CHIP_MARK = "\u200B";

/** @deprecated 使用 COMPOSER_CHIP_MARK */
export const SLASH_SKILL_CHIP_MARK = COMPOSER_CHIP_MARK;

/** 面板插入 / 序列化 `/skill` 芯片时的 token（不含尾随空格）。 */
export function formatSlashSkillToken(name: string): string {
  const n = name.trim().toLowerCase();
  return `/${n}${COMPOSER_CHIP_MARK}`;
}

/** 面板插入 / 序列化 `@path` 芯片时的 token（不含尾随空格）。 */
export function formatAtPathToken(relPath: string): string {
  const p = relPath.replace(/\\/g, "/");
  if (/\s/.test(p)) return `@\`${p}\`${COMPOSER_CHIP_MARK}`;
  return `@${p}${COMPOSER_CHIP_MARK}`;
}

/**
 * 仅抽取「芯片标记」过的 `/skill`；手打字面量不触发。
 */
export function extractSlashSkillNames(userText: string): string[] {
  const names: string[] = [];
  // 标记与 COMPOSER_CHIP_MARK（\u200B）对齐。
  const re = /(?:^|[\s`])\/([a-z0-9]+(?:-[a-z0-9]+)*)\u200B/gi;
  for (const m of userText.matchAll(re)) {
    const name = m[1];
    if (name) names.push(name.toLowerCase());
  }
  return [...new Set(names)];
}

/**
 * 仅抽取「芯片标记」过的 `@path`；手打字面量不进 context。
 * 支持 `@foo/bar.ts`、@`path with space`、@"path with space"。
 */
export function extractContextPaths(userText: string): string[] {
  const out: string[] = [];
  // 标记与 COMPOSER_CHIP_MARK（\u200B）对齐；明文路径不得吞掉 ZWSP。
  const re = /(?:^|[\s])@(?:"([^"]+)"|`([^`]+)`|([^\s@\u200B]+))\u200B/g;
  for (const m of userText.matchAll(re)) {
    const p = (m[1] || m[2] || m[3] || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .replace(/\/+$/, "");
    if (p) out.push(p);
  }
  return [...new Set(out)];
}
