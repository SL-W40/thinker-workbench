/**
 * Skills 目录列表（Composer `/` 菜单用；不读正文）。
 */

/** 单条 skill 摘要。 */
export type SkillListItem = {
  /** 斜杠名（小写 kebab）。 */
  name: string;
  /** 一行描述。 */
  description: string;
  /** 来源标签：global / thinker / cursor。 */
  source: string;
};

/** 桌面 skills API。 */
export type ThinkerSkillsApi = {
  /** 列出 dataDir + workspace 下可见 skills。 */
  list(workspaceRoot?: string | null): Promise<SkillListItem[]>;
};
