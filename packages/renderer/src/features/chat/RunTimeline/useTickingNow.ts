/**
 * live 期间按帧刷新 now（100ms）：驱动尾部探索调用「加载中留组外、
 * 结束满 TAIL_MIN_DISPLAY_MS 后自动收组」。live 结束后再补一次到点结算，
 * 避免刚跑完的快速工具卡在组外。
 */
import { useEffect, useState } from "react";
import { TAIL_MIN_DISPLAY_MS } from "../timelineExplore";

export function useTickingNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (live) {
      const timer = window.setInterval(() => setNow(Date.now()), 100);
      return () => window.clearInterval(timer);
    }
    const timer = window.setTimeout(() => setNow(Date.now()), TAIL_MIN_DISPLAY_MS + 50);
    return () => window.clearTimeout(timer);
  }, [live]);
  return now;
}
