/**
 * KaTeX 数学公式渲染；解析失败时回退为等宽原文。
 */
import { useMemo } from "react";
import katex from "katex";

type Props = {
  /** TeX 源。 */
  value: string;
  /** 块级居中。 */
  display?: boolean;
};

export function MathView({ value, display = false }: Props) {
  const result = useMemo(() => {
    try {
      const html = katex.renderToString(value, {
        displayMode: display,
        throwOnError: true,
        trust: false,
        strict: "ignore",
      });
      return { ok: true as const, html };
    } catch {
      return { ok: false as const, html: "" };
    }
  }, [value, display]);

  if (!result.ok) {
    return (
      <code className={`tw-md-math-error${display ? " tw-md-math-error--display" : ""}`}>
        {display ? `$$${value}$$` : `$${value}$`}
      </code>
    );
  }

  return (
    <span
      className={`tw-md-math${display ? " tw-md-math--display" : ""}`}
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}
