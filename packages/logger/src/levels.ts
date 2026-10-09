import type { LogLevel } from "./types";

const RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function levelRank(level: LogLevel): number {
  return RANK[level];
}

export function levelEnabled(min: LogLevel, level: LogLevel): boolean {
  return levelRank(level) >= levelRank(min);
}
