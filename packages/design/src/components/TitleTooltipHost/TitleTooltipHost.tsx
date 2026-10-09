/**
 * 主题化 `title` 浮层宿主：拦截原生 title，渲染 `.tw-tooltip`。
 * 由 ThemeProvider 挂载一次即可。
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DELAY_MS = 380;
const GAP = 8;
const ATTR = "data-tw-title";

type TipState = {
  text: string;
  x: number;
  y: number;
};

/** 从指针下的元素栈找到带 title / data-tw-title 的节点。 */
function titledFromPoint(clientX: number, clientY: number): HTMLElement | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.classList.contains("tw-tooltip")) continue;
    const native = node.getAttribute("title");
    if (native?.trim()) {
      node.setAttribute(ATTR, native.trim());
      node.removeAttribute("title");
      return node;
    }
    if (node.getAttribute(ATTR)?.trim()) return node;
  }
  return null;
}

/** 相对锚点矩形放置浮层，尽量避开视口边缘。 */
function place(anchor: DOMRect, tipW: number, tipH: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = anchor.left + (anchor.width - tipW) / 2;
  let y = anchor.bottom + GAP;
  if (y + tipH > vh - 6) y = anchor.top - tipH - GAP;
  if (x < 6) x = 6;
  if (x + tipW > vw - 6) x = Math.max(6, vw - tipW - 6);
  if (y < 6) y = 6;
  return { x, y };
}

/** 用主题化浮层标签替代原生 `title` 提示。 */
export function TitleTooltipHost() {
  const [tip, setTip] = useState<TipState | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef(0);
  const showTimer = useRef(0);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function hide() {
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
      current.current = null;
      setTip(null);
    }

    function showFor(el: HTMLElement) {
      const text = el.getAttribute(ATTR)?.trim();
      if (!text) return;
      current.current = el;
      window.clearTimeout(showTimer.current);
      showTimer.current = window.setTimeout(() => {
        const rect = el.getBoundingClientRect();
        setTip({ text, x: rect.left, y: rect.bottom + GAP });
      }, DELAY_MS);
    }

    function onMove(event: PointerEvent) {
      const el = titledFromPoint(event.clientX, event.clientY);
      if (!el) {
        if (current.current) hide();
        return;
      }
      if (el === current.current) return;
      hide();
      showFor(el);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", hide, { passive: true });
    window.addEventListener("keydown", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", hide);
      window.removeEventListener("keydown", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  useEffect(() => {
    if (!tip || !tipRef.current || !current.current) return;
    const rect = current.current.getBoundingClientRect();
    const box = tipRef.current.getBoundingClientRect();
    const next = place(rect, box.width, box.height);
    if (next.x !== tip.x || next.y !== tip.y) setTip({ ...tip, ...next });
  }, [tip]);

  if (!tip || typeof document === "undefined") return null;

  return createPortal(
    <div ref={tipRef} className="tw-tooltip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>,
    document.body,
  );
}
