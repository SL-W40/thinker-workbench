/**
 * 进程内的记忆服务。
 * 由 runtime 持有并放进 RunContext；图节点只向它要仓库和压缩器，不再自建缓存。
 */
import type { AutoCompactDeps, AutoCompactor } from "./compact/autoCompact";
import { AutoCompactor as AutoCompactorImpl } from "./compact/autoCompact";
import { defaultProjectMemoryLoader, DEFAULT_PROJECT_MEMORY_SOURCES } from "./projectMemory";
import type { MemoryRepository } from "./repository";
import { createSqliteMemoryRepository } from "./repository-sqlite";
import {
  type SessionMemoryDeps,
  SessionMemoryServiceImpl,
} from "./sessionMemory";

const PROJECT_MEMORY_TTL = 30_000;

export type MemoryHost = {
  repo(dataDir?: string, workspaceId?: string): Promise<MemoryRepository>;
  sessionService(runId: string, deps: SessionMemoryDeps): SessionMemoryServiceImpl;
  compactor(runId: string, deps: AutoCompactDeps): AutoCompactor;
  projectMemory(workspaceRoot: string): Promise<string>;
  /** run 结束后丢掉按 run 缓存的压缩器 / 抽取器。仓库按工作区保留。 */
  releaseRun(runId: string): void;
};

export function createMemoryHost(): MemoryHost {
  const repos = new Map<string, MemoryRepository>();
  const sessions = new Map<string, SessionMemoryServiceImpl>();
  const compactors = new Map<string, AutoCompactor>();
  const projects = new Map<string, { ts: number; value: string }>();

  return {
    async repo(dataDir, workspaceId) {
      const key = `${dataDir ?? "__none__"}::${workspaceId ?? "__none__"}`;
      const cached = repos.get(key);
      if (cached) return cached;
      const created = await createSqliteMemoryRepository(dataDir, workspaceId);
      repos.set(key, created);
      return created;
    },
    sessionService(runId, deps) {
      const cached = sessions.get(runId);
      if (cached) return cached;
      const svc = new SessionMemoryServiceImpl(deps);
      sessions.set(runId, svc);
      return svc;
    },
    compactor(runId, deps) {
      const cached = compactors.get(runId);
      if (cached) return cached;
      const created = new AutoCompactorImpl(deps);
      compactors.set(runId, created);
      return created;
    },
    async projectMemory(workspaceRoot) {
      const now = Date.now();
      const hit = projects.get(workspaceRoot);
      if (hit && now - hit.ts < PROJECT_MEMORY_TTL) return hit.value;
      const value = await defaultProjectMemoryLoader.load(
        workspaceRoot,
        DEFAULT_PROJECT_MEMORY_SOURCES,
      );
      projects.set(workspaceRoot, { ts: now, value });
      return value;
    },
    releaseRun(runId) {
      sessions.delete(runId);
      compactors.delete(runId);
    },
  };
}
