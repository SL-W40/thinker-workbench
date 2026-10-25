/**
 * 解析 / 高亮结果的跨实例缓存。
 *
 * 打开 .md 文件是整篇解析 + 全量建 element，几千行要几百毫秒；组件重新挂载、
 * 或在两个文件间来回切时会把这笔钱重复付一遍。这里按源文本缓存结果，
 * 相同输入直接复用。
 *
 * 缓存的是解析产物（AST / HTML 字符串），调用方应把它当只读：
 * 组件内的 useMemo 本来就在多次渲染间共享同一个对象，跨实例复用只是把
 * 这个共享范围扩大到整个页面。
 */

type Entry<T> = { value: T; cost: number };

type Cache<T> = {
  get(key: string): T | undefined;
  set(key: string, value: T, cost: number): void;
};

/**
 * 建一个按插入顺序淘汰的缓存。
 * 同时限制条目数与累计字符数：单个几千行的文档就能吃掉几 MB，
 * 只按条数限会让内存随文档大小失控。
 */
function createCache<T>(maxItems: number, maxChars: number): Cache<T> {
  const map = new Map<string, Entry<T>>();
  let chars = 0;
  return {
    get(key) {
      return map.get(key)?.value;
    },
    set(key, value, cost) {
      if (map.has(key)) return;
      // 先按上限腾位置，再插入；单条就超限时会把旧的全清空
      while (map.size > 0 && (map.size >= maxItems || chars + cost > maxChars)) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        const dropped = map.get(oldest);
        map.delete(oldest);
        if (dropped) chars -= dropped.cost;
      }
      map.set(key, { value, cost });
      chars += cost;
    },
  };
}

/** 整篇解析结果：条目少、但单条可能很大。 */
export const documentCache = createCache<unknown>(12, 3_000_000);

/** 代码块高亮：条目多、单条通常很小。 */
export const highlightCache = createCache<unknown>(512, 1_500_000);

/** 从缓存取；类型由调用点收窄。 */
export function cacheGet<T>(cache: Cache<unknown>, key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

/** 写入缓存。 */
export function cacheSet<T>(cache: Cache<unknown>, key: string, value: T, cost: number): void {
  cache.set(key, value, cost);
}
