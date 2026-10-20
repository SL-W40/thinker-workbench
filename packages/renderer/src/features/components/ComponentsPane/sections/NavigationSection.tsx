/**
 * 导航与标记控件样例：Tabs（线条 / 文档）/ Chip（演示状态自持）。
 */
import { Chip, Tabs } from "@thinker-workbench/design/react";
import { useState } from "react";
import { useT } from "../../../../i18n/useI18n";
import { DemoCard } from "../ComponentCard";

type Props = {
  onOpenDocs: (docId: string) => void;
};

export function NavigationSection({ onOpenDocs }: Props) {
  const t = useT();
  const [lineTab, setLineTab] = useState("files");
  const [docTab, setDocTab] = useState("notes");
  const [docTabs, setDocTabs] = useState([
    { id: "notes", dirty: true },
    { id: "terminal", dirty: false },
  ]);
  const [chips, setChips] = useState(["rg", "git"]);

  return (
    <>
      <DemoCard
        docId="Tabs"
        titleKey="components.section.tabs"
        descKey="components.section.tabsDesc"
        onOpenDocs={onOpenDocs}
      >
        <Tabs
          aria-label={t("components.section.tabs")}
          value={lineTab}
          onChange={setLineTab}
          tabs={[
            { id: "files", label: t("components.demo.tabFiles") },
            { id: "changes", label: t("components.demo.tabChanges") },
            { id: "terminal", label: t("components.demo.tabTerminal") },
          ]}
        />
        <Tabs
          variant="document"
          aria-label={t("components.section.tabs")}
          value={docTab}
          onChange={setDocTab}
          onClose={(id) => {
            setDocTabs((prev) => (prev.length <= 1 ? prev : prev.filter((tab) => tab.id !== id)));
            setDocTab((current) => {
              if (current !== id) return current;
              const next = docTabs.filter((tab) => tab.id !== id);
              return next[0]?.id ?? current;
            });
          }}
          tabs={docTabs.map((tab) => ({
            id: tab.id,
            label: t(
              tab.id === "notes" ? "components.demo.docTabNotes" : "components.demo.docTabTerminal",
            ),
            dirty: tab.dirty,
            closable: true,
            closeLabel: t("components.demo.tabClose"),
          }))}
        />
      </DemoCard>

      <DemoCard
        docId="Chip"
        titleKey="components.section.chip"
        descKey="components.section.chipDesc"
        onOpenDocs={onOpenDocs}
      >
        <div className="components-row">
          {chips.map((token) => (
            <Chip
              key={token}
              tone={token === "git" ? "accent" : "neutral"}
              removeLabel={`${t("components.demo.chipRemove")} ${token}`}
              onRemove={() => setChips((prev) => prev.filter((item) => item !== token))}
            >
              <code>{token}</code>
            </Chip>
          ))}
          <Chip tone="danger">{t("components.demo.badgeDanger")}</Chip>
        </div>
      </DemoCard>
    </>
  );
}
