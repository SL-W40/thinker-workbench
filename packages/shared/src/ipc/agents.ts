/**
 * Subagent 定义与 Customize / Task 工具共用类型。
 */

import type { CustomizeScope, CustomizeSource } from "./customize";

/** 落盘 frontmatter + 正文解析后的子代理定义。 */
export type SubagentDefinition = {
  name: string;
  description: string;
  /** `inherit` 或模型目录中的 model id。 */
  model: string;
  readonly: boolean;
  isBackground: boolean;
  /** system 指令正文。 */
  body: string;
  /** 绝对路径（调试 / 打开文件）。 */
  filePath?: string;
  scope?: CustomizeScope;
  source?: CustomizeSource;
  writable?: boolean;
};

/** 写入 / 更新输入。 */
export type SubagentUpsertInput = {
  scope: CustomizeScope;
  name: string;
  description?: string;
  model?: string;
  readonly?: boolean;
  isBackground?: boolean;
  body: string;
};

/** 列表结果。 */
export type SubagentListResult = {
  agents: SubagentDefinition[];
};

/** 桌面 Subagents API。 */
export type ThinkerAgentsApi = {
  list(workspaceRoot?: string | null): Promise<SubagentListResult>;
  upsert(input: SubagentUpsertInput): Promise<SubagentDefinition>;
  remove(scope: CustomizeScope, name: string): Promise<void>;
  copyToScope(name: string, fromPath: string, scope: CustomizeScope): Promise<SubagentDefinition>;
};
