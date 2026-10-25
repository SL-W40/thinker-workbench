/**
 * Git 写操作 API 封装（只读检视接口见 `platform/ipc/workspaceFs.ts`）。
 * 所有写操作都返回统一回执，UI 只负责展示 error。
 */
import type {
  GitBranch,
  GitCheckoutInput,
  GitCommitInput,
  GitCommitResult,
  GitMutationResult,
  GitPullInput,
  GitPushInput,
  GitStashInput,
  GitStashResult,
} from "@thinker-workbench/shared";
import { failMutation } from "@thinker-workbench/shared";

function api() {
  return window.thinker?.git;
}

/** 桥接不存在时的统一失败回执（dev / 老版本 preload）。 */
function unavailable(): GitMutationResult {
  return failMutation("error", "当前环境不支持 Git 写操作");
}

export async function gitStage(workspaceId: string, paths: string[]): Promise<GitMutationResult> {
  return (await api()?.stage(workspaceId, paths)) ?? unavailable();
}

export async function gitUnstage(workspaceId: string, paths: string[]): Promise<GitMutationResult> {
  return (await api()?.unstage(workspaceId, paths)) ?? unavailable();
}

export async function gitDiscard(workspaceId: string, paths: string[]): Promise<GitMutationResult> {
  return (await api()?.discard(workspaceId, paths)) ?? unavailable();
}

export async function gitCommit(input: GitCommitInput): Promise<GitCommitResult> {
  const res = await api()?.commit(input);
  return res ?? { ...unavailable() };
}

export async function gitCheckout(input: GitCheckoutInput): Promise<GitMutationResult> {
  return (await api()?.checkout(input)) ?? unavailable();
}

export async function gitBranchList(
  workspaceId: string,
): Promise<{ ok: boolean; branches: GitBranch[]; error?: string }> {
  const res = await api()?.branchList(workspaceId);
  return res ?? { ok: false, branches: [], error: "当前环境不支持 Git 写操作" };
}

export async function gitPush(input: GitPushInput): Promise<GitMutationResult> {
  return (await api()?.push(input)) ?? unavailable();
}

export async function gitPull(input: GitPullInput): Promise<GitMutationResult> {
  return (await api()?.pull(input)) ?? unavailable();
}

export async function gitStashPush(input: GitStashInput): Promise<GitStashResult> {
  const res = await api()?.stashPush(input);
  return res ?? { ...unavailable() };
}

export async function gitStashPop(input: GitStashInput): Promise<GitMutationResult> {
  return (await api()?.stashPop(input)) ?? unavailable();
}
