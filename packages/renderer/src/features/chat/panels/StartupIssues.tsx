/**
 * 主进程启动步骤失败时，在工作空间列表上方留一条说明。
 * 没有失败就不渲染。
 */
import type { StartupIssue } from "@thinker-workbench/shared";
import { useEffect, useState } from "react";
import { useT } from "../../../ui/i18n/useI18n";
import "./WorkspaceSidebar.less";

export function StartupIssues() {
  const t = useT();
  const [issues, setIssues] = useState<StartupIssue[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const list = window.thinker?.listStartupIssues;
      if (!list) return;
      void list().then((next) => {
        if (alive) setIssues(next);
      });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
    };
  }, []);

  if (issues.length === 0) return null;
  const detail = issues.map((issue) => `${issue.step}: ${issue.message}`).join("; ");
  return (
    <p className="ws-sidebar__notice" role="status">
      {t("workspaces.startupIssues", { detail })}
    </p>
  );
}
