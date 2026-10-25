/**
 * 字体栈唯一来源：UI / 正文无衬线栈与代码等宽栈。
 *
 * 只用各系统自带字体，不引入字体文件（ Electron 打包里放字体要额外体积与授权）。
 * 排序规则：
 * 1. 西文字体排在中文前面——同一个栈里缺字形才往后退，
 *    这样拉丁字母不会被中文字体抢走，避免笔画糊、小字号发虚；
 * 2. 西文按「锐利优先」排：Win11 的 Segoe UI Variable Text 比经典 Segoe UI 质量更好，
 *    再退 system-ui / -apple-system（macOS 落到 SF），Roboto（Linux/ChromeOS），最后 Arial；
 * 3. 中文按清晰度排：PingFang SC（macOS）→ Hiragino Sans GB → 微软雅黑 UI（Windows UI 版比
 *    微软雅黑排版更紧、更清楚）→ Noto Sans CJK SC（Linux），末尾必须留 sans-serif 兜底。
 */
export const SANS_STACK =
  '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Noto Sans CJK SC", sans-serif';

/**
 * 代码等宽栈：同样先平台最优——Cascadia（Win11 终端字体的 UI 版也很清楚）→ Consolas（Win10）
 * → ui-monospace → SF Mono（macOS）→ Menlo，最后 monospace 兜底。
 */
export const MONO_STACK =
  '"Cascadia Code", "Cascadia Mono", Consolas, ui-monospace, "SFMono-Regular", "SF Mono", Menlo, monospace';
