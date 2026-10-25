/**
 * 共享 ResizeObserver：整个应用只创建一份实例，元素按需挂载 / 卸载。
 *
 * 之前每个气泡各建一个 RO，长会话下是几十上百份实例；面板宽度一变它们会同时触发，
 * 回调里又各自读 scrollHeight / clientHeight。合并成一份后，同一批次里只有第一次读会触发布局，
 * 后续读都复用同一份布局结果。
 *
 * 回调不需要调用方自己稳定：内部用 ref 转发给最新一次渲染的闭包。
 */
import { type RefObject, useEffect, useRef } from "react";

type Handler = (el: HTMLElement) => void;

/** 元素 -> 挂在该元素上的回调包装（同一个元素可能被多处观察）。 */
const handlers = new Map<Element, Set<Handler>>();
let observer: ResizeObserver | null = null;

function getObserver(): ResizeObserver | null {
  if (typeof ResizeObserver === "undefined") return null;
  if (!observer) {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const set = handlers.get(entry.target);
        if (!set) continue;
        for (const handler of set) handler(entry.target as HTMLElement);
      }
    });
  }
  return observer;
}

/** 观察一个元素；元素卸载时自动摘除，最后一个观察者摘掉时才 unobserve。 */
export function useSharedResizeObserver(
  ref: RefObject<HTMLElement | null>,
  handler: Handler,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = getObserver();
    if (!ro) return;
    const wrapped: Handler = (target) => handlerRef.current(target);

    let set = handlers.get(el);
    if (!set) {
      set = new Set();
      handlers.set(el, set);
    }
    set.add(wrapped);
    ro.observe(el);
    return () => {
      const current = handlers.get(el);
      if (!current) return;
      current.delete(wrapped);
      if (current.size === 0) {
        handlers.delete(el);
        ro.unobserve(el);
      }
    };
  }, [ref]);
}
