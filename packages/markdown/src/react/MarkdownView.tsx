/**
 * Markdown 渲染根组件：一层 STABLE 的文档外壳（主题 / 链接点击上下文 / 脚注 registry）+ 块序列渲染。
 *
 * 原 530 行里的大部分已按渲染职责外移：`InlineView`（行内序列与图片）、
 * `PendingBlocks`（流式软预览）、`MarkdownCaret`（光标判定与本体）；
 * 本文件留下需要互相递归的 `Blocks` ↔ `BlockView`，以及根组件本身。
 */
import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import { parseFrontmatter } from "../frontmatter";
import { parseMarkdownDocument } from "../parse/blocks";
import { parseMarkdownStreaming } from "../stream";
import { resolveTheme } from "../themes";
import type { MarkdownThemeInput } from "../themes/types";
import type { AlertKind, BlockNode, FootnoteDef, InlineNode, ListItem } from "../types";
import { CodeBlock } from "./CodeBlock";
import { createFnRegistry, FootnoteRefContext, InlineView } from "./InlineView";
import {
  MarkdownLinkClickContext,
  type MarkdownLinkClickHandler,
  useMarkdownLinkClick,
} from "./LinkClickContext";
import { Caret, ownsLiveCaret } from "./MarkdownCaret";
import { MathView } from "./MathView";
import { MermaidDiagram } from "./MermaidDiagram";
import { PendingBlock } from "./PendingBlocks";
import { StreamChrome } from "./StreamChrome";
import { TableBlock } from "./TableBlock";
import { MarkdownThemeProvider } from "./ThemeContext";

// biome-ignore-all lint/suspicious/noArrayIndexKey: AST 渲染以位置作 key
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
  /**
   * 链接点击；返回 true 表示已处理（preventDefault）。
   * 未提供时保持默认导航。
   */
  onLinkClick?: MarkdownLinkClickHandler;
  /**
   * 渲染在文章最底部的附加区块（如文档元数据 / 待办列表）。
   * 本包不解释其语义，由业务层组装后传入，避免把领域概念耦合进渲染器。
   */
  footer?: ReactNode;
};

const ALERT_LABEL: Record<AlertKind, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

function Blocks({
  nodes,
  caretOnLast = false,
}: {
  nodes: BlockNode[];
  caretOnLast?: boolean;
}): ReactNode {
  return nodes.map((node, index) => (
    <BlockView
      key={index}
      node={node}
      caret={caretOnLast && index === nodes.length - 1 && !ownsLiveCaret(node)}
    />
  ));
}

function ListItemView({ item, caret = false }: { item: ListItem; caret?: boolean }) {
  const singlePara = item.children.length === 1 && item.children[0]?.type === "paragraph";
  const body = singlePara ? (
    <InlineView nodes={item.children[0].type === "paragraph" ? item.children[0].children : []} />
  ) : (
    <Blocks nodes={item.children} caretOnLast={caret} />
  );
  const tail = caret && singlePara ? <Caret /> : null;

  if (item.task) {
    return (
      <li className="tw-md-task-item">
        <input type="checkbox" checked={item.checked} readOnly />
        <span className="tw-md-task-text">
          {body}
          {tail}
        </span>
      </li>
    );
  }
  return (
    <li>
      {body}
      {tail}
    </li>
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

function BlockView({ node, caret = false }: { node: BlockNode; caret?: boolean }): ReactNode {
  const tail = caret ? <Caret /> : null;
  switch (node.type) {
    case "heading": {
      const Tag = `h${node.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag id={node.id}>
          <InlineView nodes={node.children} />
          {tail}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p>
          <InlineView nodes={node.children} />
          {tail}
        </p>
      );
    case "blockquote":
      return (
        <blockquote
          className={node.alert ? `tw-md-alert tw-md-alert--${node.alert}` : undefined}
          data-alert={node.alert}
        >
          {node.alert ? <div className="tw-md-alert-title">{ALERT_LABEL[node.alert]}</div> : null}
          <Blocks nodes={node.children} caretOnLast={caret} />
          {caret && node.children.length === 0 ? tail : null}
        </blockquote>
      );
    case "code":
      return (
        <>
          <CodeBlock lang={node.lang} value={node.value} incomplete={node.incomplete} />
          {tail}
        </>
      );
    case "diagram":
      return (
        <>
          <MermaidDiagram value={node.value} incomplete={node.incomplete} />
          {tail}
        </>
      );
    case "math":
      return (
        <div className="tw-md-math-block">
          <MathView value={node.value} display />
          {node.incomplete ? <span className="tw-md-caret" aria-hidden="true" /> : tail}
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
            <ListItemView
              key={index}
              item={item}
              caret={Boolean(caret) && index === node.items.length - 1}
            />
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
                  <Blocks
                    nodes={def}
                    caretOnLast={
                      Boolean(caret) &&
                      index === node.items.length - 1 &&
                      dIndex === item.definitions.length - 1
                    }
                  />
                </dd>
              ))}
            </div>
          ))}
        </dl>
      );
    case "table": {
      return (
        <TableBlock
          headers={node.headers}
          aligns={node.aligns}
          rows={node.rows}
          incomplete={node.incomplete}
          renderInline={(nodes) => <InlineView nodes={nodes} />}
          trailing={tail}
        />
      );
    }
    case "hr":
      return (
        <>
          <hr />
          {tail}
        </>
      );
    case "pending":
      return <PendingBlock kind={node.kind} value={node.value} />;
    default:
      return null;
  }
}

/** 将 markdown 渲染为带主题的文章 DOM。 */
export function MarkdownView({
  markdown,
  theme,
  className,
  streaming = false,
  onLinkClick,
  footer,
}: MarkdownViewProps) {
  const resolved = resolveTheme(theme);
  const doc = useMemo(() => {
    // 前置元数据（frontmatter）是文档元数据，不参与正文渲染
    const source = parseFrontmatter(markdown).body;
    if (streaming) {
      const r = parseMarkdownStreaming(source);
      return { blocks: r.blocks, footnotes: r.footnotes };
    }
    return parseMarkdownDocument(source);
  }, [markdown, streaming]);
  const style = resolved.vars as CSSProperties;

  return (
    <MarkdownThemeProvider theme={resolved}>
      <MarkdownLinkClickContext.Provider value={onLinkClick ?? null}>
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
          <FootnoteRefContext.Provider value={createFnRegistry()}>
            {doc.blocks.length === 0 && streaming ? (
              <p>
                <Caret />
              </p>
            ) : (
              <Blocks nodes={doc.blocks} caretOnLast={streaming} />
            )}
            <Footnotes footnotes={doc.footnotes} />
          </FootnoteRefContext.Provider>
          {footer ? <footer className="tw-md-footer">{footer}</footer> : null}
        </article>
      </MarkdownLinkClickContext.Provider>
    </MarkdownThemeProvider>
  );
}
