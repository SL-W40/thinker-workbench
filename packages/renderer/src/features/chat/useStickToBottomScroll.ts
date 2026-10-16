/**
 * 滚动容器贴底跟随：靠近底部时内容增高自动跟上；用户上翻后解绑。
 */
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isNearBottom, scrollElementToBottom, scrollToBottomIfStuck } from "./chatStickScroll";

type Options = {
  scrollerRef: RefObject<HTMLElement | null>;
  /** 观察高度变化的内容根（如 .thread）；缺省则只靠 followKey。 */
  contentRef?: RefObject<HTMLElement | null>;
  /** 内容更新信号（messages / timeline 等）；贴底时跟随。 */
  followKey: unknown;
  /** 递增时强制贴底（发送、切会话、打开子代理 tab）。 */
  stickNonce?: number;
  /** 无内容时不滚。 */
  enabled?: boolean;
};

export function useStickToBottomScroll({
  scrollerRef,
  contentRef,
  followKey,
  stickNonce = 0,
  enabled = true,
}: Options): { showJump: boolean; jumpToLatest: () => void } {
  const stuckRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const lastStickNonce = useRef(stickNonce);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !enabled) return;
    const onScroll = () => {
      const near = isNearBottom(el);
      stuckRef.current = near;
      setShowJump(!near);
    };
    // 向上滚先解绑，避免本帧内容增高把视口拽回底部；触控板微抖用 rAF 校正
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY >= 0) return;
      stuckRef.current = false;
      requestAnimationFrame(() => {
        if (!scrollerRef.current) return;
        if (isNearBottom(scrollerRef.current)) {
          stuckRef.current = true;
          setShowJump(false);
        } else {
          setShowJump(true);
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
    };
  }, [scrollerRef, enabled]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !enabled) return;
    if (lastStickNonce.current !== stickNonce) {
      lastStickNonce.current = stickNonce;
      stuckRef.current = true;
      setShowJump(false);
      scrollElementToBottom(el, "auto");
      return;
    }
    scrollToBottomIfStuck(el, stuckRef.current, "auto");
  }, [enabled, scrollerRef, stickNonce, followKey]);

  useEffect(() => {
    const el = scrollerRef.current;
    const content = contentRef?.current;
    if (!el || !content || !enabled) return;
    const ro = new ResizeObserver(() => {
      if (stuckRef.current) {
        scrollToBottomIfStuck(el, true, "auto");
      } else {
        setShowJump(true);
      }
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [scrollerRef, contentRef, enabled, followKey]);

  const jumpToLatest = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    stuckRef.current = true;
    setShowJump(false);
    scrollElementToBottom(el, "smooth");
  }, [scrollerRef]);

  return { showJump, jumpToLatest };
}
