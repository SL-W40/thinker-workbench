/**
 * 流式源码裁剪：只在「整行边界」把源码交给 mermaid。
 *
 * 半行源码（正在打字的那一行）几乎必然解析失败，而 mermaid 的失败路径同样要走
 * 一遍语法检测与布局，既浪费主线程又让画面停在上一帧。这里统一在把源码喂给
 * mermaid 之前裁掉它，并给出归一化签名用于「内容没变就跳过渲染」。
 */
import { meaningfulLines } from "./looksRenderable";

export type RenderablePrefix = {
  /** 可交给 mermaid 的源码前缀。 */
  text: string;
  /** 是否停在整行边界（true 才值得渲染）。 */
  atLineEnd: boolean;
};

/**
 * 丢弃正在打字的最后一行：源码未以换行结尾时，最后一行视为不完整。
 * 例："graph TD\nA-->B\nC-" → "graph TD\nA-->B\n"。
 */
export function renderablePrefix(source: string): RenderablePrefix {
  if (!source) return { text: "", atLineEnd: false };
  if (source.endsWith("\n")) return { text: source, atLineEnd: true };
  const cut = source.lastIndexOf("\n");
  if (cut < 0) return { text: "", atLineEnd: false };
  return { text: source.slice(0, cut + 1), atLineEnd: true };
}

/** 归一化签名：去行尾空白与尾部空行，用于判断内容是否真的变了。 */
export function sourceSignature(source: string): string {
  const lines = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/**
 * 本次该拿去渲染的源码；返回 null 表示还不值得渲染（源码太短 / 停在半行）。
 * 围栏已闭合时用完整源码，不做裁剪。
 */
export function streamRenderSource(source: string, incomplete: boolean): string | null {
  const prefix = incomplete ? renderablePrefix(source) : { text: source, atLineEnd: true };
  if (!prefix.atLineEnd || !prefix.text.trim()) return null;
  // 只有流式才要求至少两行：已闭合的源码即便不成形也要交给 mermaid，好把错误如实报出来
  if (incomplete && meaningfulLines(prefix.text).length < 2) return null;
  return prefix.text;
}
