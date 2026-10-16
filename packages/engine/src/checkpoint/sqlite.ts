/**
 * LangGraph SqliteSaver 工厂：落在 `<checkpointDir>/langgraph.sqlite`。
 */
import fs from "node:fs";
import path from "node:path";
import { type BaseCheckpointSaver, MemorySaver } from "@langchain/langgraph";

export async function createSqliteCheckpointer(
  checkpointDir: string,
): Promise<BaseCheckpointSaver> {
  const dir = checkpointDir.trim();
  if (!dir) return new MemorySaver();
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "langgraph.sqlite");
  try {
    const { SqliteSaver } = await import("@langchain/langgraph-checkpoint-sqlite");
    // 不同包边界下 BaseCheckpointSaver 偶发类型不兼容，运行时同一接口
    return SqliteSaver.fromConnString(dbPath) as unknown as BaseCheckpointSaver;
  } catch (err) {
    console.warn(
      "[engine] SqliteSaver unavailable, falling back to MemorySaver:",
      err instanceof Error ? err.message : err,
    );
    return new MemorySaver();
  }
}
