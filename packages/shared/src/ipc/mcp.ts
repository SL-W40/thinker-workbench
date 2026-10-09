/**
 * MCP 服务端配置与运行时状态（stdio 首期）。
 */

/** 传输类型；首期仅 stdio。 */
export type McpTransport = "stdio";

/** 落盘 / IPC 用的 MCP server 配置。 */
export type McpServerConfig = {
  id: string;
  name: string;
  enabled: boolean;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  /** 可选工作目录。 */
  cwd?: string | null;
};

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

/** 新建 / 更新时的可写字段（id 创建后不可改）。 */
export type McpServerUpsertInput = {
  id: string;
  name?: string;
  enabled?: boolean;
  transport?: McpTransport;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string | null;
};

/** 桌面 MCP API。 */
export type ThinkerMcpApi = {
  list(): Promise<McpListResult>;
  upsert(input: McpServerUpsertInput): Promise<McpServerConfig>;
  remove(id: string): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<McpServerConfig>;
  /** 临时连接一次，返回状态（不永久占用）。 */
  test(input: McpServerUpsertInput): Promise<McpServerRuntimeStatus>;
  /** 弹出选文件对话框，从 Cursor 风格 mcp.json 导入。 */
  importCursorFile(): Promise<{ imported: string[]; skipped: string[] }>;
  /** 订阅运行时状态推送。 */
  onStatus(cb: (status: McpServerRuntimeStatus) => void): () => void;
};
