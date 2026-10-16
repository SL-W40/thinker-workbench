/**
 * Mermaid 图表：流式防抖渲染、手势缩放、复制/存图；骨架仅用于错误占位。
 */
import mermaid from "mermaid";
import { useEffect, useId, useRef, useState } from "react";
import { looksRenderable } from "../mermaid/looksRenderable";
import { mermaidVariablesFromCss } from "../themes/tokens";
import { MermaidActions } from "./MermaidActions";
import { MermaidViewport } from "./MermaidViewport";
import { StreamChrome } from "./StreamChrome";
import { useMarkdownTheme } from "./ThemeContext";

/** 流式未闭合时的防抖，避免每个 token 都调 mermaid。 */
const STREAM_DEBOUNCE_MS = 520;
/** 闭合后略等一帧，合并同拍更新。 */
const READY_DEBOUNCE_MS = 60;

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
  const [zoom, setZoom] = useState(1);
  const look = theme.mermaid.look ?? "classic";

  useEffect(() => {
    let cancelled = false;
    const delay = incomplete ? STREAM_DEBOUNCE_MS : READY_DEBOUNCE_MS;

    if (incomplete && !looksRenderable(value)) {
      setError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      if (!value.trim()) return;
      const renderId = `twmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
      void (async () => {
        try {
          const host = hostRef.current?.closest(".tw-md") ?? hostRef.current;
          const vars = resolveMermaidVariables(host, theme.mermaid.themeVariables);
          const next = await renderMermaid(
            renderId,
            value,
            theme.id,
            theme.mermaid.theme,
            look,
            vars,
          );
          if (cancelled) return;
          setSvg(next);
          setError(null);
        } catch (err) {
          if (cancelled) return;
          // 流式中解析失败是常态：保留上一帧，不进错误/骨架态
          if (incomplete) {
            setError(null);
            return;
          }
          setError(err instanceof Error ? err.message : String(err));
        }
      })();
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, theme, reactId, incomplete, look]);

  // 源码切换较大时重置缩放，避免旧平移错位
  useEffect(() => {
    setZoom(1);
  }, [incomplete]);

  const actions = <MermaidActions source={value} svg={svg} zoom={zoom} onZoomChange={setZoom} />;

  const canvas = svg ? (
    <MermaidViewport svgHtml={svg} zoom={zoom} onZoomSet={setZoom} />
  ) : (
    <div className="tw-md-mermaid-canvas tw-md-mermaid-canvas--empty" aria-hidden="true" />
  );

  if (incomplete) {
    return (
      <div ref={hostRef}>
        <StreamChrome
          kind="mermaid"
          label="Mermaid"
          status="streaming"
          actions={actions}
          footer={
            <pre className="tw-md-stream-source">
              <code>{value || " "}</code>
              <span className="tw-md-caret" aria-hidden="true" />
            </pre>
          }
        >
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
          <pre className="tw-md-stream-source">
            <code>{value}</code>
          </pre>
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
