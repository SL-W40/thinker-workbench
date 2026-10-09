/**
 * UI 会话快照协议。
 * 持久化到 `~/.thinker/session.json`，供 renderer 在首帧前恢复路由栈与设置页分区。
 */

/** 可序列化的页面栈快照。 */
export type PageStackSnapshot = {
  /** 栈内页面路径 / hash 条目（按时间序）。 */
  entries: string[];
  /** 当前栈顶下标。 */
  index: number;
  /** 曾访问过的页面集合（用于导航态）。 */
  visited: string[];
};

/** 整份 UI 会话快照。 */
export type UiSessionSnapshot = {
  /** 当前 location hash。 */
  hash: string;
  /** 设置页当前分区 id。 */
  settingsSection: string;
  /** 页面栈。 */
  stack: PageStackSnapshot;
};

/** Preload 暴露的会话读写 API。 */
export type ThinkerSessionApi = {
  /** 同步读取，便于 renderer 在首帧绘制前恢复栈。 */
  getSnapshot(): UiSessionSnapshot | null;
  /** 写入（替换）整份快照。 */
  setSnapshot(snapshot: UiSessionSnapshot): void;
};
