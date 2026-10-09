/**
 * 文件 Checkpointer：每线程一个 JSON，原子写（tmp + rename）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { Checkpoint, Checkpointer } from "./types";

export class FileCheckpointer implements Checkpointer {
  constructor(private readonly dir: string) {}

  private fileFor(threadId: string): string {
    const safe = threadId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(this.dir, `${safe}.json`);
  }

  async load(threadId: string): Promise<Checkpoint | null> {
    const file = this.fileFor(threadId);
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as Checkpoint;
      if (!parsed || parsed.threadId !== threadId) return null;
      return parsed;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return null;
      throw err;
    }
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const file = this.fileFor(checkpoint.threadId);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const body = JSON.stringify(checkpoint);
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, file);
  }

  /** 清除线程 checkpoint（done / cancel / 新 send 前）。 */
  async clear(threadId: string): Promise<void> {
    const file = this.fileFor(threadId);
    try {
      await fs.unlink(file);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw err;
    }
  }
}
