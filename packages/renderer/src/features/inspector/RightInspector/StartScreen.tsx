/**
 * RightInspector 起始磁贴（无标签时展示）。
 */
import type { GitStatus } from "@thinker-workbench/shared";
import { useT } from "../../../i18n/useI18n";
import { BrowserStartIcon, FileStartIcon, GitIcon, TerminalStartIcon } from "../icons";

type Props = {
  totals: GitStatus["totals"] | undefined;
  onOpenChanges: () => void;
  onOpenFilesPane: () => void;
  onOpenTerminal: () => void;
  onOpenBrowser: () => void;
};

export function StartScreen({
  totals,
  onOpenChanges,
  onOpenFilesPane,
  onOpenTerminal,
  onOpenBrowser,
}: Props) {
  const t = useT();

  return (
    <div className="agent-start">
      <button type="button" className="agent-start__item" onClick={onOpenChanges}>
        <span className="agent-start__ico">
          <GitIcon />
        </span>
        <span className="agent-start__label">{t("inspector.section.changes")}</span>
        {totals && (totals.added > 0 || totals.removed > 0) ? (
          <span className="agent-start__stats">
            <span className="changes-pane__add">+{totals.added}</span>
            <span className="changes-pane__del">−{totals.removed}</span>
          </span>
        ) : null}
      </button>
      <button type="button" className="agent-start__item" onClick={onOpenFilesPane}>
        <span className="agent-start__ico">
          <FileStartIcon />
        </span>
        <span className="agent-start__label">{t("inspector.section.files")}</span>
      </button>
      <button type="button" className="agent-start__item" onClick={() => onOpenTerminal()}>
        <span className="agent-start__ico">
          <TerminalStartIcon />
        </span>
        <span className="agent-start__label">{t("inspector.section.terminal")}</span>
      </button>
      <button type="button" className="agent-start__item" onClick={() => onOpenBrowser()}>
        <span className="agent-start__ico">
          <BrowserStartIcon />
        </span>
        <span className="agent-start__label">{t("inspector.section.browser")}</span>
      </button>
    </div>
  );
}
