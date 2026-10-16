/** logger-web 查询面已移除。 */

export function logsMeta(): unknown {
  return { shards: [], total: 0 };
}

export function logsQuery(_q: unknown): unknown {
  return { rows: [], total: 0 };
}

export function logsTraces(_n: number): unknown {
  return [];
}
