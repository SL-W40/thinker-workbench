/**
 * 高亮代码块；流式未完成时显示 caret 与 StreamChrome；顶栏提供复制 / 下载。
 */
import { useMemo } from "react";
import { highlightCode } from "../highlight";
import { CodeBlockActions } from "./CodeBlockActions";
import { StreamChrome } from "./StreamChrome";

type Props = {
  /** 语言提示（传给 highlight.js）。 */
  lang: string;
  /** 代码正文。 */
  value: string;
  /** 围栏尚未闭合时为 true。 */
  incomplete?: boolean;
};

export function CodeBlock({ lang, value, incomplete = false }: Props) {
  const { html, language } = useMemo(() => highlightCode(value, lang), [lang, value]);
  const label = language && language !== "text" ? language : "code";

  return (
    <StreamChrome
      kind="code"
      label={label}
      status={incomplete ? "streaming" : "ready"}
      actions={<CodeBlockActions value={value} language={language || "text"} />}
    >
      <pre className={`tw-md-pre${incomplete ? " tw-md-pre--streaming" : ""}`}>
        <code
          className={`hljs language-${language}`}
          dangerouslySetInnerHTML={{ __html: html || " " }}
        />
        {incomplete ? <span className="tw-md-caret" aria-hidden="true" /> : null}
      </pre>
    </StreamChrome>
  );
}
