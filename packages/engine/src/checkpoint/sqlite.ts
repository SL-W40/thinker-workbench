/**
 * LangGraph SqliteSaver 工厂：落在 `<checkpointDir>/langgraph.sqlite`。
 * 打不开就失败。不换成 MemorySaver——那只活在本进程，界面却会以为可以续跑。
 */
import fs from "node:fs";
import path from "node:path";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

export async function createSqliteCheckpointer(
  checkpointDir: string,
): Promise<BaseCheckpointSaver> {
  const dir = checkpointDir.trim();
  if (!dir) {
    throw new Error("SqliteSaver requires a checkpoint directory.");
  }
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "langgraph.sqlite");
  try {
    const { SqliteSaver } = await import("@langchain/langgraph-checkpoint-sqlite");
    // 不同包边界下 BaseCheckpointSaver 偶发类型不兼容，运行时同一接口
    return SqliteSaver.fromConnString(dbPath) as unknown as BaseCheckpointSaver;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`SqliteSaver unavailable at ${dbPath}: ${detail}`);
  }
}
