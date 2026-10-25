/**
 * Git 写操作 IPC：Changes 面板的暂存 / 提交 / 放弃 / 分支 / 远端操作。
 *
 * handler 只做三件事：解析工作空间根、调用 `gitWrite`、把回执原样返回；
 * 业务判定与错误归一都在 workspace 层，避免 IPC 层堆积分支逻辑。
 */
import type {
  GitCheckoutInput,
  GitCommitInput,
  GitMutationResult,
  GitPullInput,
  GitPushInput,
  GitStashInput,
} from "@thinker-workbench/shared";
import { failMutation, IpcChannels } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { getWorkspace } from "../db/workspacesStore";
import { desktopLog } from "../log/setup";
import {
  gitBranchList,
  gitCheckout,
  gitCommit,
  gitDiscard,
  gitPull,
  gitPush,
  gitStage,
  gitStashPop,
  gitStashPush,
  gitUnstage,
} from "../workspace/gitWrite";

const log = desktopLog("gitHandlers");

/** 解析工作空间根路径。 */
function requireRoot(workspaceId: unknown): string | null {
  if (typeof workspaceId !== "string" || !workspaceId.trim()) return null;
  const ws = getWorkspace(workspaceId.trim());
  return ws?.rootPath ?? null;
}

/** 统一入口：解析失败返回失败回执，成功则执行 body。 */
async function withRoot(
  workspaceId: unknown,
  body: (cwd: string) => Promise<GitMutationResult>,
): Promise<GitMutationResult> {
  const cwd = requireRoot(workspaceId);
  if (!cwd) return failMutation("cwd_missing", "工作空间不存在");
  try {
    return await body(cwd);
  } catch (err) {
    log.warn("Git 写操作异常", { error: String(err) });
    return failMutation("error", String(err), String(err));
  }
}

/** 注册 Git 写操作通道。 */
export function registerGitHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.workspaceGitStage, async (_e, workspaceId: string, paths: string[]) =>
    withRoot(workspaceId, (cwd) => gitStage(cwd, paths)),
  );

  ipcMain.handle(
    IpcChannels.workspaceGitUnstage,
    async (_e, workspaceId: string, paths: string[]) =>
      withRoot(workspaceId, (cwd) => gitUnstage(cwd, paths)),
  );

  ipcMain.handle(
    IpcChannels.workspaceGitDiscard,
    async (_e, workspaceId: string, paths: string[]) =>
      withRoot(workspaceId, (cwd) => gitDiscard(cwd, paths)),
  );

  ipcMain.handle(IpcChannels.workspaceGitCommit, async (_e, input: GitCommitInput) =>
    withRoot(input?.workspaceId, (cwd) => gitCommit(cwd, input ?? { workspaceId: "" })),
  );

  ipcMain.handle(IpcChannels.workspaceGitCheckout, async (_e, input: GitCheckoutInput) =>
    withRoot(input?.workspaceId, (cwd) => gitCheckout(cwd, input ?? { workspaceId: "" })),
  );

  ipcMain.handle(IpcChannels.workspaceGitBranchList, async (_e, workspaceId: string) => {
    const cwd = requireRoot(workspaceId);
    if (!cwd) return { ok: false, branches: [], error: "工作空间不存在" };
    return gitBranchList(cwd);
  });

  ipcMain.handle(IpcChannels.workspaceGitPush, async (_e, input: GitPushInput) =>
    withRoot(input?.workspaceId, (cwd) => gitPush(cwd, input ?? { workspaceId: "" })),
  );

  ipcMain.handle(IpcChannels.workspaceGitPull, async (_e, input: GitPullInput) =>
    withRoot(input?.workspaceId, (cwd) => gitPull(cwd, input ?? { workspaceId: "" })),
  );

  ipcMain.handle(IpcChannels.workspaceGitStashPush, async (_e, input: GitStashInput) =>
    withRoot(input?.workspaceId, (cwd) => gitStashPush(cwd, input ?? { workspaceId: "" })),
  );

  ipcMain.handle(IpcChannels.workspaceGitStashPop, async (_e, input: GitStashInput) =>
    withRoot(input?.workspaceId, (cwd) => gitStashPop(cwd, input ?? { workspaceId: "" })),
  );
}
