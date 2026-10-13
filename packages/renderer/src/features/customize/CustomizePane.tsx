/**
 * 控制台 Customize：MCP / Skills / Rules / Subagents。
 */
import { SegmentedControl } from "@thinker-workbench/design/react";
import type { WorkspaceRecord } from "@thinker-workbench/shared";
import { useEffect, useState } from "react";
import { listWorkspaces } from "../../bridge/workspaces";
import { useT } from "../../i18n/useI18n";
import { AgentsCustomizePanel } from "./AgentsCustomizePanel";
import { McpCustomizePanel } from "./McpCustomizePanel";
import { RulesCustomizePanel } from "./RulesCustomizePanel";
import { SkillsCustomizePanel } from "./SkillsCustomizePanel";
import "./customize.less";

export type CustomizeTabId = "mcps" | "skills" | "rules" | "subagents";

const TAB_IDS: CustomizeTabId[] = ["mcps", "skills", "rules", "subagents"];

type Props = {
  active: boolean;
};

/** Customize 主体：各 tab 内按作用域分组展开。 */
export function CustomizePane({ active }: Props) {
  const t = useT();
  const [tab, setTab] = useState<CustomizeTabId>("mcps");
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);

  useEffect(() => {
    if (!active) return;
    void listWorkspaces()
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]));
  }, [active]);

  return (
    <div className="customize-shell" hidden={!active}>
      <header className="customize-header">
        <div className="customize-header__text">
          <h1>{t("customize.title")}</h1>
          <p>{t("customize.lead")}</p>
        </div>
      </header>
      <div className="customize-tabs">
        <SegmentedControl
          value={tab}
          onChange={(v) => {
            if ((TAB_IDS as readonly string[]).includes(v)) setTab(v as CustomizeTabId);
          }}
          options={TAB_IDS.map((id) => ({
            value: id,
            label: t(`customize.tabs.${id}`),
          }))}
          aria-label={t("customize.tabsLabel")}
        />
      </div>
      <div className="customize-body">
        {tab === "mcps" ? <McpCustomizePanel workspaces={workspaces} /> : null}
        {tab === "skills" ? <SkillsCustomizePanel workspaces={workspaces} /> : null}
        {tab === "rules" ? <RulesCustomizePanel workspaces={workspaces} /> : null}
        {tab === "subagents" ? <AgentsCustomizePanel workspaces={workspaces} /> : null}
      </div>
    </div>
  );
}
