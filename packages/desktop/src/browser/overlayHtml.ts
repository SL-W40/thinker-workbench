/**
 * AI 锁定蒙层 HTML（独立 WebContentsView）。
 * 使用与产品一致的 --tw-* token，随主题同步。
 */

export type OverlayThemeTokens = {
  bg: string;
  bgElev: string;
  fg: string;
  fgMuted: string;
  accent: string;
  accentStrong: string;
  accentInk: string;
  border: string;
  fontUi: string;
};

/** 按视觉主题给出蒙层 token（自定义主题走 light 近似）。 */
export function overlayTokensForVisual(visual: string): OverlayThemeTokens {
  switch (visual) {
    case "dark":
      return {
        bg: "#111111",
        bgElev: "#1a1a1a",
        fg: "#f2f2f2",
        fgMuted: "#a3a3a3",
        accent: "#5b8def",
        accentStrong: "#3b6fd4",
        accentInk: "#ffffff",
        border: "rgba(255,255,255,0.14)",
        fontUi: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
      };
    case "aurora":
      return {
        bg: "#0b1220",
        bgElev: "#121a2c",
        fg: "#e8eefc",
        fgMuted: "#9aa8c7",
        accent: "#6ea8ff",
        accentStrong: "#4f8ff0",
        accentInk: "#ffffff",
        border: "rgba(255,255,255,0.12)",
        fontUi: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
      };
    case "notes":
      return {
        bg: "#f4ebe0",
        bgElev: "#fffaf3",
        fg: "#2a2218",
        fgMuted: "#6b5c4c",
        accent: "#c47a3a",
        accentStrong: "#a8642a",
        accentInk: "#ffffff",
        border: "rgba(42,34,24,0.16)",
        fontUi: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
      };
    case "eyecare":
      return {
        bg: "#eef2e6",
        bgElev: "#f7f9f1",
        fg: "#243024",
        fgMuted: "#5c6b5c",
        accent: "#5a8f5a",
        accentStrong: "#457245",
        accentInk: "#ffffff",
        border: "rgba(36,48,36,0.14)",
        fontUi: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
      };
    default:
      return {
        bg: "#ffffff",
        bgElev: "#f7f7f7",
        fg: "#1a1a1a",
        fgMuted: "#6b6b6b",
        accent: "#3b82f6",
        accentStrong: "#2563eb",
        accentInk: "#ffffff",
        border: "rgba(0,0,0,0.12)",
        fontUi: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
      };
  }
}

/** 生成蒙层 data URL；文案由调用方按 locale 传入。 */
export function buildOverlayDataUrl(options: {
  tokens: OverlayThemeTokens;
  title: string;
  takeControl: string;
}): string {
  const { tokens, title, takeControl } = options;
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root {
    --tw-bg: ${tokens.bg};
    --tw-bg-elev: ${tokens.bgElev};
    --tw-fg: ${tokens.fg};
    --tw-fg-muted: ${tokens.fgMuted};
    --tw-accent: ${tokens.accent};
    --tw-accent-strong: ${tokens.accentStrong};
    --tw-accent-ink: ${tokens.accentInk};
    --tw-border: ${tokens.border};
    --tw-font-ui: ${tokens.fontUi};
  }
  html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    font-family: var(--tw-font-ui);
    background: transparent;
    user-select: none;
    cursor: default;
  }
  #root {
    width: 100%;
    height: 100%;
    position: relative;
  }
  #hit {
    position: absolute;
    inset: 0;
    background: transparent;
  }
  #panel {
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 14px;
    background: color-mix(in srgb, var(--tw-bg) 72%, transparent);
    backdrop-filter: blur(2px);
    color: var(--tw-fg);
  }
  #root.is-hot #panel { display: flex; }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px 28px;
    border: 1.5px solid var(--tw-border);
    border-radius: 12px;
    background: var(--tw-bg-elev);
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  }
  .title {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  button {
    appearance: none;
    border: 1.5px solid var(--tw-accent-strong);
    border-radius: 10px;
    background: var(--tw-accent-strong);
    color: var(--tw-accent-ink);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 16px;
    cursor: pointer;
  }
  button:hover {
    filter: brightness(1.05);
  }
  button:focus-visible {
    outline: 2px solid var(--tw-accent);
    outline-offset: 2px;
  }
</style>
</head>
<body>
  <div id="root">
    <div id="hit"></div>
    <div id="panel">
      <div class="card">
        <div class="title">${escapeHtml(title)}</div>
        <button type="button" id="take">${escapeHtml(takeControl)}</button>
      </div>
    </div>
  </div>
  <script>
    const root = document.getElementById('root');
    const take = document.getElementById('take');
    document.addEventListener('mouseenter', () => root.classList.add('is-hot'));
    document.addEventListener('mouseleave', () => root.classList.remove('is-hot'));
    root.addEventListener('mousemove', () => root.classList.add('is-hot'));
    take.addEventListener('click', () => {
      try { window.takeControl && window.takeControl(); } catch (_) {}
    });
  </script>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
