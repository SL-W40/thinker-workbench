/**
 * Mermaid 画布：滚轮/捏合缩放、拖拽平移；超高时按 maxHeightPx 自动缩放；
 * 换帧时旧帧淡出、新帧淡入，避免整块闪换。
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
/** 新旧两帧叠放的淡入淡出时长；与 .tw-md-mermaid-layer 动画保持一致。 */
export const MERMAID_FADE_MS = 180;

export type MermaidIntrinsicInfo = {
  /** SVG 自身坐标系宽高（未缩放）。 */
  w: number;
  h: number;
  /** 为放进高度上限自动算出的缩放（1 = 放得下，不需要缩）。 */
  fit: number;
};

/** 高度上限约束下的「自适应」缩放：放得下就不缩。 */
export function fitZoomFor(height: number, maxHeightPx: number): number {
  if (!(maxHeightPx > 0) || !(height > 0)) return 1;
  return Math.min(1, maxHeightPx / height);
}

type Props = {
  /** 画布额外 class。 */
  className?: string;
  /** Mermaid 渲染出的 SVG 字符串。 */
  svgHtml: string;
  /** 缩放变化时回调（供顶栏百分比）。 */
  onZoomChange?: (zoom: number) => void;
  /** 受控显示比例（已含自适应缩放）；不传则内部管理。 */
  zoom?: number;
  onZoomSet?: (zoom: number) => void;
  /** intrinsic 尺寸与自适应比例回传，供外层做高度占位与自动适配。 */
  onIntrinsicSize?: (info: MermaidIntrinsicInfo) => void;
  /** 视口高度（px）；不传则由内容撑开。用于高度占位与过渡。 */
  heightPx?: number;
  /** 高度上限（px）；超出时自动缩小到放得下。 */
  maxHeightPx?: number;
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
  onIntrinsicSize,
  heightPx,
  maxHeightPx,
}: Props) {
  const [innerZoom, setInnerZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  /** 上一帧的 SVG：新帧淡入期间留在下层淡出。 */
  const [outgoing, setOutgoing] = useState<string | null>(null);
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
  const intrinsicRef = useRef<(MermaidIntrinsicInfo & { key: string }) | null>(null);
  /** 当前帧实际应用的像素尺寸。 */
  const appliedSizeRef = useRef<{ w: number; h: number } | null>(null);
  /** appliedSizeRef 对应的 svgHtml，用于区分「换帧」与「同帧改缩放」。 */
  const appliedKeyRef = useRef("");
  /** 上一帧的像素尺寸：淡出层是原始 SVG 字符串（不带缩放尺寸），要按它补上，否则会闪一下大图。 */
  const prevSizeRef = useRef<{ w: number; h: number } | null>(null);
  const setZoomRef = useRef(setZoom);
  setZoomRef.current = setZoom;
  const sizeCallbackRef = useRef(onIntrinsicSize);
  sizeCallbackRef.current = onIntrinsicSize;
  const prevSvgRef = useRef(svgHtml);

  /**
   * 淡出层拿到的是原始 SVG 字符串（只有 mermaid 给的初始尺寸），
   * 挂载时立刻补成上一帧的像素尺寸——ref 在 commit 阶段执行、早于绘制，不会闪。
   */
  const sizeOutgoing = (el: HTMLDivElement | null) => {
    const svg = el?.querySelector("svg");
    const size = prevSizeRef.current;
    if (!svg || !size) return;
    svg.setAttribute("width", String(size.w));
    svg.setAttribute("height", String(size.h));
    svg.style.width = `${size.w}px`;
    svg.style.height = `${size.h}px`;
    svg.style.maxWidth = "none";
  };

  // 换帧时把上一帧留在下层淡出，新帧淡入：整块替换的闪烁换成一次柔和过渡
  useEffect(() => {
    const prev = prevSvgRef.current;
    prevSvgRef.current = svgHtml;
    if (!prev || prev === svgHtml) return;
    setOutgoing(prev);
    const id = window.setTimeout(() => setOutgoing(null), MERMAID_FADE_MS);
    return () => window.clearTimeout(id);
  }, [svgHtml]);

  // 按 zoom 改 SVG 像素尺寸；viewBox 不变 → 矢量重绘，文字不糊
  useLayoutEffect(() => {
    const svg = canvasRef.current?.querySelector("svg");
    if (!svg) return;
    const key = `${svgHtml}|${maxHeightPx ?? 0}`;
    let intrinsic = intrinsicRef.current;
    if (!intrinsic || intrinsic.key !== key) {
      const size = readIntrinsicSize(svg);
      intrinsic = { key, w: size.w, h: size.h, fit: fitZoomFor(size.h, maxHeightPx ?? 0) };
      intrinsicRef.current = intrinsic;
      // 尺寸与自适应比例回传：外层据此做高度占位与顶栏百分比
      sizeCallbackRef.current?.({ w: size.w, h: size.h, fit: intrinsic.fit });
    }
    const w = intrinsic.w * zoom;
    const h = intrinsic.h * zoom;
    // 淡出层在下一个 commit 才创建，这里先留一份旧尺寸给它；
    // 只有换帧才滚动——同帧内 zoom 变化会再跑一次本 effect，不能把中间尺寸当成上一帧
    if (appliedKeyRef.current !== svgHtml) {
      prevSizeRef.current = appliedSizeRef.current;
      appliedKeyRef.current = svgHtml;
    }
    appliedSizeRef.current = { w, h };
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.style.width = `${w}px`;
    svg.style.height = `${h}px`;
    svg.style.maxWidth = "none";
  }, [svgHtml, zoom, maxHeightPx]);

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
    const a = e.touches[0];
    const b = e.touches[1];
    if (!a || !b || e.touches.length !== 2) {
      pinchRef.current = null;
      return;
    }
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    pinchRef.current = { distance, zoom };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    const a = e.touches[0];
    const b = e.touches[1];
    if (!a || !b) return;
    e.preventDefault();
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = distance / Math.max(1, pinchRef.current.distance);
    setZoom(pinchRef.current.zoom * ratio);
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  const onDoubleClick = () => {
    // 双击复位：回到「按高度上限自适应」的比例，而不是原始尺寸
    setZoom(intrinsicRef.current?.fit ?? 1);
    setPan({ x: 0, y: 0 });
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 画布视口：双击复位 + 双指捏合缩放属手势交互，图表本身非交互控件
    <div
      ref={rootRef}
      className={["tw-md-mermaid-viewport", className].filter(Boolean).join(" ")}
      style={heightPx && heightPx > 0 ? { height: `${heightPx}px` } : undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onDoubleClick={onDoubleClick}
    >
      {/* 旧帧：只做淡出，不参与手势与无障碍树 */}
      {outgoing ? (
        <div
          ref={sizeOutgoing}
          className="tw-md-mermaid-layer tw-md-mermaid-layer--out"
          aria-hidden="true"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid 渲染产出的上一帧 SVG，本身只能以 HTML 注入展示
          dangerouslySetInnerHTML={{ __html: outgoing }}
        />
      ) : null}
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
          className="tw-md-mermaid-canvas tw-md-mermaid-layer"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid 渲染产出的 SVG，本身只能以 HTML 注入展示
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
