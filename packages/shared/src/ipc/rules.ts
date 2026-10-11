/**
 * Rules 文件列表与 CRUD（始终注入的短规则）。
 */

import type { CustomizeScope, CustomizeSource } from "./customize";

/** 单条规则文件。 */
export type RuleListItem = {
  /** 相对所属根的路径（POSIX）。 */
  relPath: string;
  /** 展示名。 */
  name: string;
  body: string;
  filePath?: string;
  scope?: CustomizeScope;
  source?: CustomizeSource;
  writable?: boolean;
};

/** 写入输入。 */
export type RuleUpsertInput = {
  scope: CustomizeScope;
  /** 相对路径，如 `thinker-core.md`。 */
  relPath: string;
  body: string;
};

/** 列表。 */
export type RuleListResult = {
  rules: RuleListItem[];
};

/** 桌面 rules API。 */
export type ThinkerRulesApi = {
  list(workspaceRoot?: string | null): Promise<RuleListResult>;
  upsert(input: RuleUpsertInput): Promise<RuleListItem>;
  remove(scope: CustomizeScope, relPath: string): Promise<void>;
  copyToScope(relPath: string, fromPath: string, scope: CustomizeScope): Promise<RuleListItem>;
};
