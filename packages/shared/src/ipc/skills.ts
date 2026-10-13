/**
 * Skills 目录列表（Composer `/` 菜单与 Customize CRUD）。
 */

import type { CustomizeScope, CustomizeSource } from "./customize";

/** 单条 skill 摘要。 */
export type SkillListItem = {
  /** 斜杠名（小写 kebab）。 */
  name: string;
  /** 一行描述。 */
  description: string;
  /** 来源标签：global / thinker。 */
  source: string;
  /** Customize 详情：正文（仅 detailed 列表）。 */
  body?: string;
  filePath?: string;
  scope?: CustomizeScope;
  customizeSource?: CustomizeSource;
  writable?: boolean;
  disableModelInvocation?: boolean;
};

/** 列表结果。 */
export type SkillListResult = {
  skills: SkillListItem[];
};

/** 写入输入。 */
export type SkillUpsertInput = {
  scope: CustomizeScope;
  name: string;
  description?: string;
  body: string;
  disableModelInvocation?: boolean;
};

/** 桌面 skills API（Composer `/` + Customize CRUD）。 */
export type ThinkerSkillsApi = {
  /** 列出 dataDir + workspace 下可见 skills（摘要）。 */
  list(workspaceRoot?: string | null): Promise<SkillListItem[]>;
  /** Customize：含正文与可写标记。 */
  listDetailed(workspaceRoot?: string | null): Promise<SkillListResult>;
  upsert(input: SkillUpsertInput): Promise<SkillListItem>;
  remove(scope: CustomizeScope, name: string): Promise<void>;
  copyToScope(name: string, fromPath: string, scope: CustomizeScope): Promise<SkillListItem>;
};
