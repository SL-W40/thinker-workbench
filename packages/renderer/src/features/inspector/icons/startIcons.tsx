/**
 * 起始页 / 分区图标：Git / 文件 / 终端 / 浏览器 / 子代理。
 */
// biome-ignore-all lint/a11y/noSvgWithoutTitle: 本文件是纯装饰性图标集合，svg 全部 aria-hidden，不承载语义，无需 title

export function GitIcon() {
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

export function FileStartIcon() {
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

export function TerminalStartIcon() {
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

export function BrowserStartIcon() {
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
export function SubagentStartIcon() {
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
