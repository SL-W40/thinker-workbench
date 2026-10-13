/**
 * Customize IPC：skills / rules / agents 的列表与 CRUD。
 */
import {
  type CustomizeScope,
  IpcChannels,
  normalizeCustomizeScope,
  type RuleUpsertInput,
  type SkillUpsertInput,
  type SubagentUpsertInput,
} from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { copyAgentToScope, listAgents, removeAgent, upsertAgent } from "../customize/agentsStore";
import { copyRuleToScope, listRules, removeRule, upsertRule } from "../customize/rulesStore";
import {
  copySkillToScope,
  listSkillsDetailed,
  listSkillsSummary,
  removeSkill,
  upsertSkill,
} from "../customize/skillsCrud";
import { assertWorkspaceRoot } from "../db/workspacesStore";
import type { AgentBridge } from "../utility/AgentBridge";
import { pushAgentHello } from "../utility/startAgentProcess";

/** 规范化可选工作区根（未登记则当作仅全局）。 */
function normalizeWorkspaceRoot(workspaceRoot?: string | null): string | null {
  if (typeof workspaceRoot !== "string" || !workspaceRoot.trim()) return null;
  try {
    return assertWorkspaceRoot(workspaceRoot.trim());
  } catch {
    return null;
  }
}

function asScope(raw: unknown): CustomizeScope {
  return normalizeCustomizeScope(raw);
}

/** 注册 Customize 相关通道（含 skills 扩展）。 */
export function registerCustomizeHandlers(ipcMain: IpcMain, bridge?: AgentBridge): void {
  const reloadSubagents = () => {
    if (!bridge) return;
    try {
      pushAgentHello(bridge);
    } catch {
      /* agent 未就绪 */
    }
  };

  ipcMain.handle(IpcChannels.skillsList, (_evt, workspaceRoot?: string | null) => {
    return listSkillsSummary(normalizeWorkspaceRoot(workspaceRoot));
  });

  ipcMain.handle(IpcChannels.skillsListDetailed, (_evt, workspaceRoot?: string | null) => {
    return listSkillsDetailed(normalizeWorkspaceRoot(workspaceRoot));
  });

  ipcMain.handle(IpcChannels.skillsUpsert, (_evt, input: SkillUpsertInput) => {
    return upsertSkill({
      ...input,
      scope: asScope(input?.scope),
    });
  });

  ipcMain.handle(IpcChannels.skillsRemove, (_evt, scope: CustomizeScope, name: string) => {
    removeSkill(asScope(scope), String(name ?? ""));
  });

  ipcMain.handle(
    IpcChannels.skillsCopyToScope,
    (_evt, name: string, fromPath: string, scope: CustomizeScope) => {
      return copySkillToScope(String(name ?? ""), String(fromPath ?? ""), asScope(scope));
    },
  );

  ipcMain.handle(IpcChannels.rulesList, (_evt, workspaceRoot?: string | null) => {
    return listRules(normalizeWorkspaceRoot(workspaceRoot));
  });

  ipcMain.handle(IpcChannels.rulesUpsert, (_evt, input: RuleUpsertInput) => {
    return upsertRule({
      ...input,
      scope: asScope(input?.scope),
    });
  });

  ipcMain.handle(IpcChannels.rulesRemove, (_evt, scope: CustomizeScope, relPath: string) => {
    removeRule(asScope(scope), String(relPath ?? ""));
  });

  ipcMain.handle(
    IpcChannels.rulesCopyToScope,
    (_evt, relPath: string, fromPath: string, scope: CustomizeScope) => {
      return copyRuleToScope(String(relPath ?? ""), String(fromPath ?? ""), asScope(scope));
    },
  );

  ipcMain.handle(IpcChannels.agentsList, (_evt, workspaceRoot?: string | null) => {
    return listAgents(normalizeWorkspaceRoot(workspaceRoot));
  });

  ipcMain.handle(IpcChannels.agentsUpsert, (_evt, input: SubagentUpsertInput) => {
    const next = upsertAgent({
      ...input,
      scope: asScope(input?.scope),
    });
    reloadSubagents();
    return next;
  });

  ipcMain.handle(IpcChannels.agentsRemove, (_evt, scope: CustomizeScope, name: string) => {
    removeAgent(asScope(scope), String(name ?? ""));
    reloadSubagents();
  });

  ipcMain.handle(
    IpcChannels.agentsCopyToScope,
    (_evt, name: string, fromPath: string, scope: CustomizeScope) => {
      return copyAgentToScope(String(name ?? ""), String(fromPath ?? ""), asScope(scope));
    },
  );
}
