/**
 * 进程内 Map 实现的 Checkpointer。
 * 默认用于测试；生产路径用 FileCheckpointer。
 */
import type { Checkpoint, Checkpointer } from "./types";

export class MemoryCheckpointer implements Checkpointer {
  private store = new Map<string, Checkpoint>();

  async load(threadId: string): Promise<Checkpoint | null> {
    return this.store.get(threadId) ?? null;
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    this.store.set(checkpoint.threadId, checkpoint);
  }

  async clear(threadId: string): Promise<void> {
    this.store.delete(threadId);
  }
}
