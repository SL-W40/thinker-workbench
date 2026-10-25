/**
 * dataDir 目录布局：dataDir 下每个落点的唯一声明。
 *
 * desktop 主进程与 engine 子进程共用同一份定义，避免两边各拼一份子路径。
 * 新增目录只需在 DATA_LAYOUT 里加一行：迁移清单、清理任务与测试断言全部由表派生。
 * 本文件保持零依赖（不引 node 内置模块），以便 renderer 侧也能安全引入。
 */

/** 数据分类：决定谁能清、何时清、是否随 dataDir 迁移。 */
export type DataKind = "config" | "state" | "workspace" | "content" | "cache";

/** 清理策略：never 永不自动清；withWorkspace 随工作区整目录删除；retention 按保留策略清。 */
export type PurgePolicy = "never" | "withWorkspace" | "retention";

export type DataEntry = {
  /** 相对 dataDir 的路径；工作区级用 `{workspaceId}` 占位。 */
  rel: string;
  kind: DataKind;
  /** 中文展示名（迁移清单 / 设置页直接用）。 */
  label: string;
  purge: PurgePolicy;
  /** 仅 cache 类需要：按天数与总大小清理。 */
  retention?: { maxAgeDays: number; maxBytes: number };
};

/** 内置默认工作区的固定 id（不参与随机 id 生成）。 */
export const DEFAULT_WORKSPACE_ID = "ws_default";

/** 一天与一兆字节的字节数，供 retention 书写。 */
const DAY = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

/**
 * 布局表。键名即落点标识，调用方一律用 dataPath() 取值，禁止再手写子路径拼接。
 */
export const DATA_LAYOUT = {
  settings: {
    rel: "settings.json",
    kind: "config",
    label: "设置",
    purge: "never",
  },
  catalogDb: {
    rel: "state/catalog.db",
    kind: "state",
    label: "工作区目录库",
    purge: "never",
  },
  sessionFile: {
    rel: "state/session.json",
    kind: "state",
    label: "窗口会话",
    purge: "never",
  },
  workspacesRoot: {
    rel: "workspaces",
    kind: "workspace",
    label: "工作区数据",
    purge: "never",
  },
  wsData: {
    rel: "workspaces/{workspaceId}",
    kind: "workspace",
    label: "工作区数据",
    purge: "withWorkspace",
  },
  wsChatDb: {
    rel: "workspaces/{workspaceId}/chat.db",
    kind: "workspace",
    label: "会话消息库",
    purge: "withWorkspace",
  },
  wsImages: {
    rel: "workspaces/{workspaceId}/images",
    kind: "workspace",
    label: "聊天附图",
    purge: "withWorkspace",
  },
  wsAttachments: {
    rel: "workspaces/{workspaceId}/attachments",
    kind: "workspace",
    label: "聊天附件",
    purge: "withWorkspace",
  },
  wsShellOutput: {
    rel: "workspaces/{workspaceId}/shell-output",
    kind: "workspace",
    label: "终端输出",
    purge: "withWorkspace",
  },
  wsCheckpoints: {
    rel: "workspaces/{workspaceId}/checkpoints",
    kind: "workspace",
    label: "运行检查点",
    purge: "withWorkspace",
  },
  wsMemory: {
    rel: "workspaces/{workspaceId}/memory.sqlite",
    kind: "workspace",
    label: "会话记忆库",
    purge: "withWorkspace",
  },
  wsTrace: {
    rel: "workspaces/{workspaceId}/trace",
    kind: "workspace",
    label: "Trace",
    purge: "withWorkspace",
  },
  wsTraceDb: {
    rel: "workspaces/{workspaceId}/trace/trace.db",
    kind: "workspace",
    label: "Trace 索引库",
    purge: "withWorkspace",
  },
  wsTraceSessions: {
    rel: "workspaces/{workspaceId}/trace/sessions",
    kind: "workspace",
    label: "Trace 载荷",
    purge: "withWorkspace",
  },
  /** 仅默认工作区使用：它就是该工作区的磁盘根，放用户与 agent 的文件。 */
  wsProject: {
    rel: "workspaces/{workspaceId}/project",
    kind: "content",
    label: "默认工作区文件",
    purge: "never",
  },
  customRules: {
    rel: "customize/rules",
    kind: "content",
    label: "全局 Rules",
    purge: "never",
  },
  customSkills: {
    rel: "customize/skills",
    kind: "content",
    label: "全局 Skills",
    purge: "never",
  },
  customAgents: {
    rel: "customize/agents",
    kind: "content",
    label: "全局 Subagents",
    purge: "never",
  },
  customMcps: {
    rel: "customize/mcps",
    kind: "content",
    label: "全局 MCP",
    purge: "never",
  },
  cacheBrowserScreenshots: {
    rel: "cache/browser-screenshots",
    kind: "cache",
    label: "浏览器截图",
    purge: "retention",
    retention: { maxAgeDays: 14, maxBytes: 512 * MB },
  },
  cacheComputerImages: {
    rel: "cache/computer/images",
    kind: "cache",
    label: "Computer 截图",
    purge: "retention",
    retention: { maxAgeDays: 7, maxBytes: 256 * MB },
  },
} as const satisfies Record<string, DataEntry>;

export type DataLayoutKey = keyof typeof DATA_LAYOUT;

/** 拼接相对路径（统一正斜杠；Node 的 fs 与 path 都能识别）。 */
function joinRel(base: string, rel: string): string {
  if (!base) return rel;
  if (base.endsWith("/")) return `${base}${rel}`;
  return `${base}/${rel}`;
}

/**
 * 解析布局表里的某个落点。
 * @param dataDir 数据根。
 * @param key 布局表键名。
 * @param vars 占位变量；工作区级落点必须给 workspaceId，否则抛错（避免写出无归属的数据）。
 */
export function dataPath(
  dataDir: string,
  key: DataLayoutKey,
  vars?: { workspaceId?: string },
): string {
  const entry = DATA_LAYOUT[key];
  const rel = entry.rel;
  if (!rel.includes("{workspaceId}")) return joinRel(dataDir, rel);
  const workspaceId = vars?.workspaceId?.trim();
  if (!workspaceId) {
    throw new Error(`workspaceId is required for data layout key: ${key}`);
  }
  return joinRel(dataDir, rel.replace("{workspaceId}", workspaceId));
}

/** 遍历布局表（迁移清单 / 设置页 / 清理任务 / 测试断言的消费入口）。 */
export function listDataEntries(): Array<DataEntry & { key: string }> {
  return Object.entries(DATA_LAYOUT).map(([key, entry]) => ({ key, ...entry }));
}

/** 判断某个落点是否为 cache 类（可再生，迁移时可跳过）。 */
export function isCacheEntry(key: DataLayoutKey): boolean {
  return DATA_LAYOUT[key].kind === "cache";
}

/**
 * 会话附图允许的根，供 desktop 与 engine 的安全校验共用：
 * `workspaces/<id>/<kind>/<file>`（kind 白名单）与 computer 截图目录。
 */
export function chatImageAllowed(dataDir: string): {
  workspacesRoot: string;
  workspaceKinds: readonly string[];
  computerImagesDir: string;
} {
  return {
    workspacesRoot: joinRel(dataDir, "workspaces"),
    workspaceKinds: ["images", "attachments"],
    computerImagesDir: dataPath(dataDir, "cacheComputerImages"),
  };
}
