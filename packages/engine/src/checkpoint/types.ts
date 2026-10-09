/**
 * Checkpoint：在每个图节点执行后快照 state，供崩溃恢复 / Resume。
 */

/** 一次节点执行后的检查点。 */
export type Checkpoint = {
  threadId: string;
  /** 刚执行完的节点 id。 */
  nodeId: string;
  state: unknown;
  updatedAt: number;
};

/** 检查点存储抽象。 */
export type Checkpointer = {
  load(threadId: string): Promise<Checkpoint | null>;
  save(checkpoint: Checkpoint): Promise<void>;
  /** 可选：清除线程检查点。 */
  clear?(threadId: string): Promise<void>;
};
