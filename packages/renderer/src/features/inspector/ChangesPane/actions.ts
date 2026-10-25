/**
 * Changes 面板的 prompt 动作：都是「交给 agent 去办」的 Git 动作，
 * 面板不直接执行，只把对应意图发给会话（实现见 RightInspector 的 onSendAction）。
 *
 * 单独成文件是为了让 ChangesPane 与 CtaActions 都能引用 —— 前者转发导出给上层，
 * 后者用类型与菜单常量，两边互引会形成循环依赖。
 */

export type ChangesPromptActionId =
  | "createBranchAndCommit"
  | "createBranchCommitAndPush"
  | "createBranch"
  | "commitAndPush"
  | "commit"
  | "commitAndCreatePr";

export const CHANGES_ACTION_PROMPTS: Record<ChangesPromptActionId, string> = {
  createBranchAndCommit:
    "Create a new branch and commit the current changes with an appropriate message.",
  createBranchCommitAndPush:
    "Create a new branch, commit the current changes, and push to the remote.",
  createBranch: "Create a new branch for the current uncommitted changes.",
  commitAndPush: "Commit the current changes with an appropriate message and push to the remote.",
  commit: "Commit the current changes with an appropriate message.",
  commitAndCreatePr: "Commit the current changes and open a pull request.",
};

/** 「提交」主按钮（非下拉部分）点击时执行的动作：与整合前顶部 CTA 的默认一致。 */
export const DEFAULT_COMMIT_ACTION: ChangesPromptActionId = "createBranchAndCommit";

/**
 * 菜单里「AI 代办」分区的全部动作，顺序即菜单展示顺序。
 * 默认动作也在列表里 —— 主按钮在做什么，菜单里必须能看见，否则用户无从核对。
 */
export const AI_COMMIT_ACTIONS: ChangesPromptActionId[] = [
  "createBranchAndCommit",
  "createBranchCommitAndPush",
  "createBranch",
  "commitAndPush",
  "commit",
  "commitAndCreatePr",
];
