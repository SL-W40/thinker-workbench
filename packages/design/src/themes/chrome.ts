/**
 * 笔记皮肤外壳变量，供 renderer Less（`notes-paper`、标题栏、dock、设置）使用。
 * 每个内置主题都必须设置这些——否则 `:root` 会保留 `notes-tokens()` 的浅色默认值。
 */

export type NotesChromeInput = {
  /** 纸面横线色。 */
  paperRule: string;
  /** 纸面页边距色。 */
  paperMargin: string;
  /** 纸面光晕。 */
  paperGlow: string;
  /** 标题栏背景。 */
  titlebarBg: string;
  /** 底栏 / 工具条背景。 */
  barBg: string;
  /** Dock 渐隐背景。 */
  dockFade: string;
  /** 实心面板背景。 */
  panelSolid: string;
  /** 弱化面板背景。 */
  panelMuted: string;
  /** 墨色淡化叠层。 */
  inkFade: string;
  /** 墨色淡化（更强）。 */
  inkFadeStrong: string;
  /** 用户气泡等强调底色。 */
  user: string;
  /** 滚动条滑块。 */
  scrollbarThumb: string;
  /** 滚动条滑块悬停。 */
  scrollbarThumbHover: string;
  /** 强调色软底（强）。 */
  accentSoftStrong?: string;
  /** 强调色软底（弱）。 */
  accentSoftMuted?: string;
  /** 强调色光晕。 */
  accentGlow?: string;
  /** 窗口关闭按钮色。 */
  winClose?: string;
  /** 窗口关闭按钮前景。 */
  winCloseInk?: string;
};

/** 把笔记外壳输入展开成 CSS 变量键值。 */
export function notesChrome(c: NotesChromeInput): Record<string, string> {
  return {
    "--paper-rule": c.paperRule,
    "--paper-margin": c.paperMargin,
    "--paper-glow": c.paperGlow,
    "--titlebar-bg": c.titlebarBg,
    "--bar-bg": c.barBg,
    "--dock-fade": c.dockFade,
    "--panel-solid": c.panelSolid,
    "--panel-muted": c.panelMuted,
    "--ink-fade": c.inkFade,
    "--ink-fade-strong": c.inkFadeStrong,
    "--user": c.user,
    "--scrollbar-thumb": c.scrollbarThumb,
    "--scrollbar-thumb-hover": c.scrollbarThumbHover,
    ...(c.accentSoftStrong ? { "--accent-soft-strong": c.accentSoftStrong } : {}),
    ...(c.accentSoftMuted ? { "--accent-soft-muted": c.accentSoftMuted } : {}),
    ...(c.accentGlow ? { "--accent-glow": c.accentGlow } : {}),
    ...(c.winClose ? { "--win-close": c.winClose } : {}),
    ...(c.winCloseInk ? { "--win-close-ink": c.winCloseInk } : {}),
  };
}
