/**
 * 挂载时拉列表的小钩子（与 MdResourcePanel 分文件，避免 Fast Refresh 混导出白屏）。
 */
import { useEffect, useState } from "react";

/** 依赖变化或手动 reload 时重新执行 `load`。 */
export function useLoadWhen<T>(
  load: () => Promise<T>,
  _deps: unknown[],
): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [_tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return {
    data,
    error,
    reload: () => setTick((n) => n + 1),
  };
}
