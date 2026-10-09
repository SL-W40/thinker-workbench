/**
 * Markdown React 渲染入口：解析 AST 并输出 `.tw-md` 文章树。
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { parseMarkdownDocument } from "../parse/blocks";
import { parseMarkdownStreaming } from "../stream";
import { resolveTheme } from "../themes";
import type { MarkdownThemeInput } from "../themes/types";
import type { BlockNode, FootnoteDef, InlineNode, ListItem } from "../types";
import { CodeBlock } from "./CodeBlock";
import { MathView } from "./MathView";
import { MermaidDiagram } from "./MermaidDiagram";
import { MarkdownThemeProvider } from "./ThemeContext";

export type MarkdownViewProps = {
  /** Markdown 源文本。 */
  markdown: string;
  /** 内置 id（`light` | `dark` | `notes` | `eyecare` | `aurora`），或完整 / 部分主题对象。 */
  theme?: MarkdownThemeInput;
  /** 追加到根 article 的 class。 */
  className?: string;
  /**
   * 对部分缓冲（如 LLM token）启用流式安全渲染。
   * 未闭合围栏 / 表格不抛错；mermaid 在可解析时软预览。
   */
  streaming?: boolean;
};

function InlineView({ nodes }: { nodes: InlineNode[] }): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <span key={index}>{node.value}</span>;
      case "code":
        return <code key={index}>{node.value}</code>;
      case "kbd":
        return <kbd key={index}>{node.value}</kbd>;
      case "strong":
        return (
          <strong key={index}>
            <InlineView nodes={node.children} />
          </strong>
        );
      case "emphasis":
        return (
          <em key={index}>
            <InlineView nodes={node.children} />
          </em>
        );
      case "strike":
        return (
          <del key={index}>
            <InlineView nodes={node.children} />
          </del>
        );
      case "mark":
        return (
          <mark key={index}>
            <InlineView nodes={node.children} />
          </mark>
        );
      case "sub":
        return (
          <sub key={index}>
            <InlineView nodes={node.children} />
          </sub>
        );
      case "sup":
        return (
          <sup key={index}>
            <InlineView nodes={node.children} />
          </sup>
        );
      case "underline":
        return (
          <u key={index}>
            <InlineView nodes={node.children} />
          </u>
        );
      case "link":
        return (
          <a key={index} href={node.href} title={node.title}>
            <InlineView nodes={node.children} />
          </a>
        );
      case "autolink":
        return (
          <a key={index} href={node.href}>
            {node.text}
          </a>
        );
      case "image":
        return <MdImage key={index} src={node.src} alt={node.alt} title={node.title} />;
      case "footnoteRef":
        return (
          <sup key={index} className="tw-md-fn-ref">
            <a
              href={`#fn-${encodeURIComponent(node.id)}`}
              id={`fnref-${encodeURIComponent(node.id)}`}
            >
              {node.id}
            </a>
          </sup>
        );
      case "math":
        return <MathView key={index} value={node.value} />;
      case "break":
        return <br key={index} />;
      default:
        return null;
    }
  });
}

function MdImage({ src, alt, title }: { src: string; alt: string; title?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <span className="tw-md-img-fallback" role="img" aria-label={alt || "image"}>
        {alt || "image"}
      </span>
    );
  }
  return <img src={src} alt={alt} title={title} onError={() => setFailed(true)} />;
}

function Blocks({ nodes }: { nodes: BlockNode[] }): ReactNode {
  return nodes.map((node, index) => <BlockView key={index} node={node} />);
}

function ListItemView({ item }: { item: ListItem }) {
  const body =
    item.children.length === 1 && item.children[0]!.type === "paragraph" ? (
      <InlineView nodes={item.children[0].children} />
    ) : (
      <Blocks nodes={item.children} />
    );

  if (item.task) {
    return (
      <li className="tw-md-task-item">
        <input type="checkbox" checked={item.checked} readOnly />
        <span className="tw-md-task-text">{body}</span>
      </li>
    );
  }
  return <li>{body}</li>;
}

/** 尚未凑齐分隔行的管道表：按行软预览成表格。 */
function PendingTable({ value }: { value: string }) {
  const rows = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim()),
    );
  if (rows.length === 0) {
    return (
      <p className="tw-md-pending-line">
        <span>{value || " "}</span>
        <span className="tw-md-caret" aria-hidden="true" />
      </p>
    );
  }
  const colCount = Math.max(...rows.map((r) => r.length), 1);
  return (
    <div className="tw-md-table-wrap tw-md-table-wrap--streaming">
      <table className="tw-md-table--streaming">
        <tbody>
          {rows.map((row, rIndex) => {
            const last = rIndex === rows.length - 1;
            return (
              <tr key={rIndex} className={last ? "tw-md-table-row--live" : undefined}>
                {Array.from({ length: colCount }, (_, cIndex) => (
                  <td key={cIndex}>
                    {row[cIndex] ?? ""}
                    {last && cIndex === colCount - 1 ? (
                      <span className="tw-md-caret" aria-hidden="true" />
                    ) : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PendingBlock({ kind, value }: { kind: string; value: string }) {
  if (kind === "table") return <PendingTable value={value} />;
  return (
    <p className="tw-md-pending-line">
      <span className="tw-md-pending-text">{value || " "}</span>
      <span className="tw-md-caret" aria-hidden="true" />
    </p>
  );
}

function Footnotes({ footnotes }: { footnotes: FootnoteDef[] }) {
  if (!footnotes.length) return null;
  return (
    <section className="tw-md-footnotes" aria-label="Footnotes">
      <ol>
        {footnotes.map((fn) => (
          <li key={fn.id} id={`fn-${encodeURIComponent(fn.id)}`}>
            <Blocks nodes={fn.children} />
            <a
              className="tw-md-fn-back"
              href={`#fnref-${encodeURIComponent(fn.id)}`}
              aria-label="Back"
            >
              ↩
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BlockView({ node }: { node: BlockNode }): ReactNode {
  switch (node.type) {
    case "heading": {
      const Tag = `h${node.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag id={node.id}>
          <InlineView nodes={node.children} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p>
          <InlineView nodes={node.children} />
        </p>
      );
    case "blockquote":
      return (
        <blockquote>
          <Blocks nodes={node.children} />
        </blockquote>
      );
    case "code":
      return <CodeBlock lang={node.lang} value={node.value} incomplete={node.incomplete} />;
    case "diagram":
      return <MermaidDiagram value={node.value} incomplete={node.incomplete} />;
    case "math":
      return (
        <div className="tw-md-math-block">
          <MathView value={node.value} display />
          {node.incomplete ? <span className="tw-md-caret" aria-hidden="true" /> : null}
        </div>
      );
    case "list": {
      const Tag = node.ordered ? "ol" : "ul";
      const taskList = node.items.some((i) => i.task);
      const className = [
        "tw-md-list",
        node.ordered ? "tw-md-list--ol" : "tw-md-list--ul",
        taskList ? "tw-md-task" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const start = node.start ?? 1;
      const style =
        node.ordered && start !== 1
          ? ({ counterReset: `tw-md-ol ${start - 1}` } as CSSProperties)
          : undefined;
      return (
        <Tag className={className} start={node.start} style={style}>
          {node.items.map((item, index) => (
            <ListItemView key={index} item={item} />
          ))}
        </Tag>
      );
    }
    case "definitionList":
      return (
        <dl className="tw-md-dl">
          {node.items.map((item, index) => (
            <div key={index} className="tw-md-dl-item">
              <dt>
                <InlineView nodes={item.term} />
              </dt>
              {item.definitions.map((def, dIndex) => (
                <dd key={dIndex}>
                  <Blocks nodes={def} />
                </dd>
              ))}
            </div>
          ))}
        </dl>
      );
    case "table": {
      return (
        <div className={`tw-md-table-wrap${node.incomplete ? " tw-md-table-wrap--streaming" : ""}`}>
          <table className={node.incomplete ? "tw-md-table--streaming" : undefined}>
            <thead>
              <tr>
                {node.headers.map((cell, index) => (
                  <th key={index} style={{ textAlign: node.aligns[index] ?? undefined }}>
                    <InlineView nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.map((row, rIndex) => {
                const last = Boolean(node.incomplete) && rIndex === node.rows.length - 1;
                return (
                  <tr key={rIndex} className={last ? "tw-md-table-row--live" : undefined}>
                    {node.headers.map((_, cIndex) => (
                      <td key={cIndex} style={{ textAlign: node.aligns[cIndex] ?? undefined }}>
                        <InlineView nodes={row[cIndex] ?? [{ type: "text", value: "" }]} />
                        {last && cIndex === node.headers.length - 1 ? (
                          <span className="tw-md-caret" aria-hidden="true" />
                        ) : null}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {node.incomplete && node.rows.length === 0 ? (
            <span className="tw-md-caret tw-md-caret--after-table" aria-hidden="true" />
          ) : null}
        </div>
      );
    }
    case "hr":
      return <hr />;
    case "pending":
      return <PendingBlock kind={node.kind} value={node.value} />;
    default:
      return null;
  }
}

/** 将 markdown 渲染为带主题的文章 DOM。 */
export function MarkdownView({ markdown, theme, className, streaming = false }: MarkdownViewProps) {
  const resolved = resolveTheme(theme);
  const doc = useMemo(() => {
    if (streaming) {
      const r = parseMarkdownStreaming(markdown);
      return { blocks: r.blocks, footnotes: r.footnotes };
    }
    return parseMarkdownDocument(markdown);
  }, [markdown, streaming]);
  const style = resolved.vars as CSSProperties;

  return (
    <MarkdownThemeProvider theme={resolved}>
      <article
        className={[
          "tw-md",
          `tw-md--${resolved.id}`,
          streaming ? "tw-md--streaming" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        data-theme={resolved.id}
        data-streaming={streaming ? "true" : "false"}
        style={style}
      >
        <Blocks nodes={doc.blocks} />
        <Footnotes footnotes={doc.footnotes} />
      </article>
    </MarkdownThemeProvider>
  );
}
