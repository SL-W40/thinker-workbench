/**
 * MCP 服务端配置与运行时状态（stdio / Streamable HTTP）。
 */
import type { CustomizeScope } from "./customize";

/** 传输类型。 */
export type McpTransport = "stdio" | "http";

/** 导入冲突策略。 */
export type McpImportConflict = "skip" | "overwrite";

type McpServerBase = {
  id: string;
  name: string;
  enabled: boolean;
  /** 列表项所在作用域；落盘文件不写这个字段。 */
  scope?: CustomizeScope;
  /** 列表项是否可写。 */
  writable?: boolean;
};

/** 本地进程 MCP。 */
export type McpStdioServerConfig = McpServerBase & {
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
  /** 可选工作目录。 */
  cwd?: string | null;
};

/** 远程 Streamable HTTP MCP。 */
export type McpHttpServerConfig = McpServerBase & {
  transport: "http";
  url: string;
  headers?: Record<string, string>;
};

/** 落盘 / IPC 用的 MCP server 配置。 */
export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

/** 单个 MCP server 运行态。 */
export type McpServerRuntimeState = "stopped" | "starting" | "ready" | "error";

/** 暴露给 UI 的工具摘要。 */
export type McpToolSummary = {
  name: string;
  description: string;
};

/** 单个 server 的运行时状态。 */
export type McpServerRuntimeStatus = {
  id: string;
  state: McpServerRuntimeState;
  toolCount?: number;
  error?: string;
  tools?: McpToolSummary[];
};

/** `mcpList` 返回：配置 + 最近状态。 */
export type McpListResult = {
  servers: McpServerConfig[];
  statuses: McpServerRuntimeStatus[];
};

type McpUpsertBase = {
  id: string;
  name?: string;
  enabled?: boolean;
  scope?: CustomizeScope;
};

/** 新建 / 更新时的可写字段（id 创建后不可改）。 */
export type McpServerUpsertInput =
  | (McpUpsertBase & {
      transport?: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string | null;
    })
  | (McpUpsertBase & {
      transport: "http";
      url: string;
      headers?: Record<string, string>;
    });

/** 桌面 MCP API。 */
export type ThinkerMcpApi = {
  list(workspaceRoot?: string | null): Promise<McpListResult>;
  upsert(input: McpServerUpsertInput): Promise<McpServerConfig>;
  remove(id: string, scope?: CustomizeScope): Promise<void>;
  setEnabled(id: string, enabled: boolean, scope?: CustomizeScope): Promise<McpServerConfig>;
  /** 临时连接一次，返回状态（不永久占用）。 */
  test(input: McpServerUpsertInput): Promise<McpServerRuntimeStatus>;
  /** 弹出选文件对话框，从 mcp.json（`mcpServers` 映射）导入。 */
  importFile(
    conflict?: McpImportConflict,
    scope?: CustomizeScope,
  ): Promise<{ imported: string[]; skipped: string[] }>;
  /** 把指定作用域导出为 mcp.json。 */
  exportFile(scope?: CustomizeScope): Promise<{ ok: boolean; path?: string }>;
  /** 订阅运行时状态推送。 */
  onStatus(cb: (status: McpServerRuntimeStatus) => void): () => void;
};
