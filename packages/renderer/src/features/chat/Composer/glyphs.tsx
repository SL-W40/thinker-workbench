/**
 * 发送 / 停止图标（圆底自绘 SVG）。
 */

/** 发送箭头图标（圆底）；原位编辑气泡复用*/
export function SendGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path
        className="composer-send-glyph"
        d="M8 11.1V5M8 5 5.4 7.6M8 5l2.6 2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StopGlyph() {
  return (
    <svg className="composer-stop" width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle
        className="composer-stop__track"
        cx="11"
        cy="11"
        r="9.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle
        className="composer-stop__arc"
        cx="11"
        cy="11"
        r="9.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="14 44"
      />
      <rect x="7.25" y="7.25" width="7.5" height="7.5" rx="1.5" fill="currentColor" />
    </svg>
  );
}
