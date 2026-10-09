/**
 * Mermaid 图表渲染：成品渲染、流式软预览与加载骨架。
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import mermaid from "mermaid";
import { mermaidVariablesFromCss } from "../themes/tokens";
import { StreamChrome } from "./StreamChrome";
import { useMarkdownTheme } from "./ThemeContext";

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

function looksRenderable(source: string): boolean {
  const t = source.trim();
  if (t.length < 12) return false;
  const lines = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  return /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/i.test(
    lines[0],
  );
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

function MermaidSkeleton() {
  return (
    <div className="tw-md-mermaid-skeleton" aria-hidden="true">
      <div className="tw-md-mermaid-skeleton-row">
        <span className="tw-md-mermaid-skeleton-node tw-md-mermaid-skeleton-node--pill" />
      </div>
      <div className="tw-md-mermaid-skeleton-vedge" />
      <div className="tw-md-mermaid-skeleton-row tw-md-mermaid-skeleton-row--fork">
        <span className="tw-md-mermaid-skeleton-node" />
        <span className="tw-md-mermaid-skeleton-hedge" />
        <span className="tw-md-mermaid-skeleton-node tw-md-mermaid-skeleton-node--wide" />
      </div>
      <div className="tw-md-mermaid-skeleton-vedge tw-md-mermaid-skeleton-vedge--short" />
      <div className="tw-md-mermaid-skeleton-row">
        <span className="tw-md-mermaid-skeleton-node tw-md-mermaid-skeleton-node--soft" />
      </div>
    </div>
  );
}

function MermaidLoading({ children }: { children?: ReactNode }) {
  return (
    <div className="tw-md-mermaid-loading" role="status" aria-busy="true">
      <div className="tw-md-mermaid-loading-stage">{children ?? <MermaidSkeleton />}</div>
      <div className="tw-md-mermaid-loading-veil" aria-hidden="true" />
    </div>
  );
}

type Props = {
  /** Mermaid 源文本。 */
  value: string;
  /** 围栏尚未闭合时为 true（软预览）。 */
  incomplete?: boolean;
};

export function MermaidDiagram({ value, incomplete = false }: Props) {
  const theme = useMarkdownTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewSvg, setPreviewSvg] = useState("");
  const [busy, setBusy] = useState(true);

  const look = theme.mermaid.look ?? "handDrawn";

  useEffect(() => {
    if (incomplete) return;

    let cancelled = false;
    const renderId = `twmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
    setBusy(true);
    setError(null);

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
        if (!cancelled) {
          setSvg(next);
          setPreviewSvg("");
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSvg("");
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [value, theme, reactId, incomplete, look]);

  useEffect(() => {
    if (!incomplete) return;

    setSvg("");
    setError(null);

    if (!looksRenderable(value)) {
      setPreviewSvg("");
      setBusy(false);
      return;
    }

    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(() => {
      const renderId = `twmd-prev-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
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
          if (!cancelled) {
            setPreviewSvg(next);
            setBusy(false);
          }
        } catch {
          if (!cancelled) setBusy(false);
        }
      })();
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, theme, reactId, incomplete, look]);

  if (incomplete) {
    const hasPreview = Boolean(previewSvg);
    const status = hasPreview
      ? "preview"
      : busy || looksRenderable(value)
        ? "loading"
        : "streaming";
    return (
      <div ref={hostRef}>
        <StreamChrome
          kind="mermaid"
          label="Mermaid"
          status={status}
          footer={
            <pre className="tw-md-stream-source">
              <code>{value || " "}</code>
              <span className="tw-md-caret" aria-hidden="true" />
            </pre>
          }
        >
          {hasPreview ? (
            <div
              className="tw-md-mermaid-canvas tw-md-mermaid-canvas--preview"
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          ) : (
            <MermaidLoading />
          )}
        </StreamChrome>
      </div>
    );
  }

  if (error) {
    return (
      <div ref={hostRef}>
        <StreamChrome kind="mermaid" label="Mermaid" status="error">
          <pre className="tw-md-mermaid-error">{error}</pre>
          <pre className="tw-md-stream-source">
            <code>{value}</code>
          </pre>
        </StreamChrome>
      </div>
    );
  }

  if (busy || !svg) {
    return (
      <div ref={hostRef}>
        <StreamChrome kind="mermaid" label="Mermaid" status="loading">
          <MermaidLoading>
            {svg ? (
              <div
                className="tw-md-mermaid-canvas tw-md-mermaid-canvas--dim"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <MermaidSkeleton />
            )}
          </MermaidLoading>
        </StreamChrome>
      </div>
    );
  }

  return (
    <div ref={hostRef}>
      <StreamChrome kind="mermaid" label="Mermaid" status="ready">
        <div className="tw-md-mermaid-canvas" dangerouslySetInnerHTML={{ __html: svg }} />
      </StreamChrome>
    </div>
  );
}
