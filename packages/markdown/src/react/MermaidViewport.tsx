/**
 * Mermaid 画布：滚轮/捏合缩放、拖拽平移。
 * 缩放通过改 SVG width/height（保留 viewBox），避免 CSS scale 导致 foreignObject 文字发糊。
 */
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.15;

type Props = {
  /** 画布额外 class。 */
  className?: string;
  /** Mermaid 渲染出的 SVG 字符串。 */
  svgHtml: string;
  /** 缩放变化时回调（供顶栏百分比）。 */
  onZoomChange?: (zoom: number) => void;
  /** 受控缩放；不传则内部管理。 */
  zoom?: number;
  onZoomSet?: (zoom: number) => void;
};

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function readIntrinsicSize(svg: SVGSVGElement): { w: number; h: number } {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    return { w: vb.width, h: vb.height };
  }
  const attrW = parseFloat(svg.getAttribute("width") || "");
  const attrH = parseFloat(svg.getAttribute("height") || "");
  if (attrW > 0 && attrH > 0) return { w: attrW, h: attrH };
  try {
    const box = svg.getBBox();
    if (box.width > 0 && box.height > 0) return { w: box.width, h: box.height };
  } catch {
    /* 未挂载时 getBBox 可能抛错 */
  }
  return { w: 800, h: 600 };
}

/** 可缩放平移的图表视口。 */
export function MermaidViewport({
  className,
  svgHtml,
  onZoomChange,
  zoom: zoomProp,
  onZoomSet,
}: Props) {
  const [innerZoom, setInnerZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoom = zoomProp ?? innerZoom;
  const setZoom = useCallback(
    (next: number | ((prev: number) => number)) => {
      const value = typeof next === "function" ? next(zoomProp ?? innerZoom) : next;
      const z = clampZoom(value);
      if (onZoomSet) onZoomSet(z);
      else setInnerZoom(z);
      onZoomChange?.(z);
    },
    [innerZoom, onZoomChange, onZoomSet, zoomProp],
  );

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const intrinsicRef = useRef<{ key: string; w: number; h: number } | null>(null);
  const setZoomRef = useRef(setZoom);
  setZoomRef.current = setZoom;

  // 按 zoom 改 SVG 像素尺寸；viewBox 不变 → 矢量重绘，文字不糊
  useLayoutEffect(() => {
    const svg = canvasRef.current?.querySelector("svg");
    if (!svg) return;
    let intrinsic = intrinsicRef.current;
    if (!intrinsic || intrinsic.key !== svgHtml) {
      const size = readIntrinsicSize(svg);
      intrinsic = { key: svgHtml, w: size.w, h: size.h };
      intrinsicRef.current = intrinsic;
    }
    const w = intrinsic.w * zoom;
    const h = intrinsic.h * zoom;
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.style.width = `${w}px`;
    svg.style.height = `${h}px`;
    svg.style.maxWidth = "none";
  }, [svgHtml, zoom]);

  // 触控板捏合会发 ctrl+wheel；需非 passive 才能 preventDefault
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setZoomRef.current((z) => z * factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setPan({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    });
  };

  const endDrag = (e: ReactPointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) {
      pinchRef.current = null;
      return;
    }
    const [a, b] = [e.touches[0]!, e.touches[1]!];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    pinchRef.current = { distance, zoom };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    e.preventDefault();
    const [a, b] = [e.touches[0]!, e.touches[1]!];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = distance / Math.max(1, pinchRef.current.distance);
    setZoom(pinchRef.current.zoom * ratio);
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  const onDoubleClick = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      ref={rootRef}
      className={["tw-md-mermaid-viewport", className].filter(Boolean).join(" ")}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onDoubleClick={onDoubleClick}
    >
      <div
        className="tw-md-mermaid-viewport__stage"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          ref={canvasRef}
          className="tw-md-mermaid-canvas"
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      </div>
    </div>
  );
}

export function clampMermaidZoom(z: number): number {
  return clampZoom(z);
}

export function stepMermaidZoom(z: number, direction: 1 | -1): number {
  return clampZoom(direction > 0 ? z * ZOOM_STEP : z / ZOOM_STEP);
}
