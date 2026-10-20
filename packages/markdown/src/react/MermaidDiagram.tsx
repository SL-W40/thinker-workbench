/**
 * Mermaid 图表：流式渐进预览（整行边界 + 自适应节流 + 换帧淡入 + 高度自适应），
 * 手势缩放、复制/存图；首帧用骨架占位。
 */
import mermaid from "mermaid";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { looksRenderable } from "../mermaid/looksRenderable";
import { nextRenderDelay } from "../mermaid/streamScheduler";
import { sourceSignature, streamRenderSource } from "../mermaid/streamSource";
import { mermaidVariablesFromCss } from "../themes/tokens";
import { MermaidActions } from "./MermaidActions";
import { clampMermaidZoom, type MermaidIntrinsicInfo, MermaidViewport } from "./MermaidViewport";
import { StreamChrome } from "./StreamChrome";
import { useMarkdownTheme } from "./ThemeContext";

/** 画布上下内边距（同 .tw-md-mermaid-canvas 的 padding），用于高度占位。 */
const CANVAS_PAD_Y = 46;
/** 高度上限取视口高度的比例：图太高时自动缩到放得下。 */
const MAX_HEIGHT_RATIO = 0.5;
/** 高度下限，避免小窗口把图压得没法看。 */
const MIN_MAX_HEIGHT = 240;

let mermaidReadyFor = "";

function ensureMermaid(
  themeId: string,
  themeName: string,
  look: "classic" | "handDrawn" | "neo",
  themeVariables: Record<string, string>,
) {
  const key = `${themeId}:${themeName}:${look}:${JSON.stringify(themeVariables)}`;
  if (mermaidReadyFor === key) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: themeName as "default" | "dark" | "forest" | "neutral" | "base",
    look,
    handDrawnSeed: 17,
    themeVariables,
    flowchart: { curve: "basis", padding: 18, htmlLabels: true },
    sequence: { actorMargin: 48, messageMargin: 32 },
  });
  mermaidReadyFor = key;
}

function resolveMermaidVariables(
  host: Element | null,
  overrides?: Record<string, string>,
): Record<string, string> {
  const fromCss = host ? mermaidVariablesFromCss(host) : {};
  return { ...fromCss, ...overrides };
}

async function renderMermaid(
  renderId: string,
  value: string,
  themeId: string,
  themeName: string,
  look: "classic" | "handDrawn" | "neo",
  themeVariables: Record<string, string>,
): Promise<string> {
  ensureMermaid(themeId, themeName, look, themeVariables);
  const result = await mermaid.render(renderId, value);
  return result.svg;
}

type Props = {
  /** Mermaid 源文本。 */
  value: string;
  /** 围栏尚未闭合时为 true（流式软渲染）。 */
  incomplete?: boolean;
};

export function MermaidDiagram({ value, incomplete = false }: Props) {
  const theme = useMarkdownTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, "");
  /** 最近一次成功渲染的 SVG；失败时保留上一帧。 */
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** 显示比例（已含按高度上限算出的自适应缩放）。 */
  const [zoom, setZoom] = useState(1);
  const [intrinsic, setIntrinsic] = useState<MermaidIntrinsicInfo | null>(null);
  const [maxHeight, setMaxHeight] = useState(0);
  const look = theme.mermaid.look ?? "classic";

  // 调度与渲染记账
  const genRef = useRef(0);
  const rafRef = useRef(0);
  const timerRef = useRef(0);
  const lastRequestRef = useRef("");
  const lastArrivalRef = useRef(0);
  const lastRenderAtRef = useRef(0);
  const lastRenderMsRef = useRef(0);
  const renderCountRef = useRef(0);
  const failStreakRef = useRef(0);
  /** 用户是否手动缩放过：手动过后不再随新帧自动适配。 */
  const userZoomedRef = useRef(false);

  // 高度上限：视口高度的 50%，随窗口自适应
  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () =>
      setMaxHeight(Math.max(MIN_MAX_HEIGHT, Math.round(window.innerHeight * MAX_HEIGHT_RATIO)));
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  // 片段边界（流式 → 定稿）时交回自适应比例的控制权
  // biome-ignore lint/correctness/useExhaustiveDependencies: incomplete 未在函数体读取但刻意保留：仅在流式片段边界交回自适应控制权
  useEffect(() => {
    userZoomedRef.current = false;
  }, [incomplete]);

  useEffect(() => {
    // 流式只喂「完整行前缀」：半行源码必然解析失败，白白走一遍语法与布局
    const source = streamRenderSource(value, incomplete);
    if (!source) return;
    // 内容（或主题）没变就不重新排期
    const requestKey = `${sourceSignature(source)}|${theme.id}|${theme.mermaid.theme}|${look}`;
    if (requestKey === lastRequestRef.current) return;
    lastRequestRef.current = requestKey;

    const now = Date.now();
    const arrivalGapMs = lastArrivalRef.current ? now - lastArrivalRef.current : 0;
    lastArrivalRef.current = now;

    if (incomplete && !looksRenderable(source)) return;

    const decision = nextRenderDelay({
      incomplete,
      lastRenderMs: lastRenderMsRef.current,
      arrivalGapMs,
      sinceLastRenderMs: lastRenderAtRef.current
        ? now - lastRenderAtRef.current
        : Number.MAX_SAFE_INTEGER,
      renderCount: renderCountRef.current,
      failStreak: failStreakRef.current,
    });
    if (!decision.render) return; // 已降级：只在围栏闭合时渲染一次

    const runId = genRef.current + 1;
    genRef.current = runId;
    // 旧请求作废；定时器不入 cleanup——effect 重跑但请求键未变时要留住它
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      // 排在下一帧之后，避免与 token 到达同帧抢主线程
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (requestKey !== lastRequestRef.current) return; // 已被更新的请求取代
        void (async () => {
          const started = Date.now();
          try {
            const host = hostRef.current?.closest(".tw-md") ?? hostRef.current;
            const vars = resolveMermaidVariables(host, theme.mermaid.themeVariables);
            const next = await renderMermaid(
              `twmd-${reactId}-${runId}`,
              source,
              theme.id,
              theme.mermaid.theme,
              look,
              vars,
            );
            if (runId !== genRef.current) return; // 慢的旧渲染不覆盖新结果
            renderCountRef.current += 1;
            failStreakRef.current = 0;
            lastRenderMsRef.current = Date.now() - started;
            lastRenderAtRef.current = Date.now();
            setSvg(next);
            setError(null);
          } catch (err) {
            if (runId !== genRef.current) return;
            failStreakRef.current += 1;
            lastRenderMsRef.current = Date.now() - started;
            lastRenderAtRef.current = Date.now();
            // 流式中解析失败是常态：保留上一帧，不进错误/骨架态
            if (incomplete) {
              setError(null);
              return;
            }
            setError(err instanceof Error ? err.message : String(err));
          }
        })();
      });
    }, decision.waitMs);

    // 不在这里 cancelAnimationFrame：theme 等依赖每次 token 都重跑本 effect，
    // 取消在途的 rAF 会白白丢掉一帧；rAF 内部自行判断是否已被新请求取代
  }, [value, theme, reactId, incomplete, look]);

  // 卸载时收掉在途的排期与渲染
  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const onIntrinsicSize = useCallback((info: MermaidIntrinsicInfo) => {
    setIntrinsic(info);
    // 新帧到来时回到自适应比例；用户手动缩放过则尊重用户
    if (!userZoomedRef.current) setZoom(info.fit);
  }, []);

  const onZoomChange = useCallback((target: number) => {
    userZoomedRef.current = true;
    setZoom(clampMermaidZoom(target));
  }, []);

  const onResetZoom = useCallback(() => {
    userZoomedRef.current = false;
    setZoom(intrinsic?.fit ?? 1);
  }, [intrinsic?.fit]);

  // 高度占位：按当前显示比例预留，并用上限封顶（超出部分靠拖动查看）
  const heightCap = maxHeight > 0 ? maxHeight + CANVAS_PAD_Y : Number.MAX_SAFE_INTEGER;
  const heightPx = intrinsic
    ? Math.min(Math.round(intrinsic.h * zoom) + CANVAS_PAD_Y, heightCap)
    : 0;

  const actions = (
    <MermaidActions
      source={value}
      svg={svg}
      zoom={zoom}
      onZoomChange={onZoomChange}
      onReset={onResetZoom}
    />
  );
  const canvas = svg ? (
    <MermaidViewport
      svgHtml={svg}
      zoom={zoom}
      onZoomSet={onZoomChange}
      onIntrinsicSize={onIntrinsicSize}
      heightPx={heightPx}
      maxHeightPx={maxHeight}
    />
  ) : (
    <div className="tw-md-mermaid-skeleton" aria-hidden="true" />
  );

  if (incomplete) {
    return (
      <div ref={hostRef}>
        <StreamChrome kind="mermaid" label="Mermaid" status="streaming" actions={actions}>
          {canvas}
        </StreamChrome>
      </div>
    );
  }

  if (error && !svg) {
    return (
      <div ref={hostRef}>
        <StreamChrome kind="mermaid" label="Mermaid" status="error" actions={actions}>
          <pre className="tw-md-mermaid-error">{error}</pre>
        </StreamChrome>
      </div>
    );
  }

  return (
    <div ref={hostRef}>
      <StreamChrome
        kind="mermaid"
        label="Mermaid"
        status={error ? "error" : "ready"}
        actions={actions}
      >
        {error && svg ? (
          <pre className="tw-md-mermaid-error tw-md-mermaid-error--banner">{error}</pre>
        ) : null}
        {canvas}
      </StreamChrome>
    </div>
  );
}
