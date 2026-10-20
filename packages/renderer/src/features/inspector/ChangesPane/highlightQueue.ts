/**
 * ChangesPane 并发与调度：diff 请求限流 + 全局高亮分片队列。
 */

/** 限制并行 git diff 请求，避免「全部展开」打满 runtime。*/
const DIFF_FETCH_LIMIT = 3;
let diffFetchesActive = 0;
const diffFetchWaiters: Array<() => void> = [];

export function acquireDiffFetch(): Promise<void> {
  if (diffFetchesActive < DIFF_FETCH_LIMIT) {
    diffFetchesActive += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    diffFetchWaiters.push(() => {
      diffFetchesActive += 1;
      resolve();
    });
  });
}

export function releaseDiffFetch() {
  diffFetchesActive = Math.max(0, diffFetchesActive - 1);
  const next = diffFetchWaiters.shift();
  if (next) next();
}

/** 高亮分片大小；空闲时推进，避免一次同步高亮上千行。*/
const HIGHLIGHT_CHUNK = 40;

function scheduleIdle(cb: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(() => cb(), { timeout: 120 });
    return () => cancelIdleCallback(id);
  }
  const id = window.setTimeout(cb, 0);
  return () => window.clearTimeout(id);
}

/** 全局高亮队列：多文件同时在视口时轮转分片，避免并行打满主线程。*/
export type HighlightJob = {
  cancelled: boolean;
  /** 执行一片；还有剩余则返回 true。*/
  tick: () => boolean;
};

const highlightQueue: HighlightJob[] = [];
let cancelHighlightPump: (() => void) | null = null;

export function enqueueHighlightJob(job: HighlightJob): () => void {
  highlightQueue.push(job);
  pumpHighlightQueue();
  return () => {
    job.cancelled = true;
  };
}

function pumpHighlightQueue() {
  if (cancelHighlightPump) return;
  cancelHighlightPump = scheduleIdle(() => {
    cancelHighlightPump = null;
    const start = performance.now();
    while (highlightQueue.length && performance.now() - start < 10) {
      const head = highlightQueue.shift();
      if (!head) break;
      if (head.cancelled) {
        continue;
      }
      const more = head.tick();
      if (!more || head.cancelled) {
        // 出队后不再回插
      } else {
        // 轮转到队尾，让其它文件也有机会推进
        highlightQueue.push(head);
        break;
      }
    }
    if (highlightQueue.length) pumpHighlightQueue();
  });
}

export { HIGHLIGHT_CHUNK };
