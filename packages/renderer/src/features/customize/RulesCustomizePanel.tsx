/**
 * Customize → Rules：按用户 / 各工作区分组展示。
 */
import type { CustomizeScope, RuleListItem, WorkspaceRecord } from "@thinker-workbench/shared";
import { useMemo, useState } from "react";
import { useT } from "../../i18n/useI18n";
import { MdResourcePanel, type MdListRow } from "./MdResourcePanel";
import { buildScopeGroups, customizeScopeKey, sameCustomizeScope } from "./scopeHelpers";
import { useLoadWhen } from "./useLoadWhen";

type Props = {
  workspaces: WorkspaceRecord[];
};

function api() {
  return window.thinker?.rules;
}

export function RulesCustomizePanel({ workspaces }: Props) {
  const t = useT();
  const groupsDef = useMemo(() => buildScopeGroups(workspaces), [workspaces]);
  const rootsKey = groupsDef.map((g) => g.workspaceRoot ?? "").join("|");

  const { data, error, reload } = useLoadWhen(async () => {
    const chunks = await Promise.all(
      groupsDef.map(async (g) => {
        const res = await api()?.list(g.workspaceRoot);
        const rules = (res?.rules ?? []).filter((r: RuleListItem) =>
          sameCustomizeScope(r.scope, g.scope),
        );
        return { key: g.key, rules };
      }),
    );
    return chunks;
  }, [rootsKey]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeScope, setActiveScope] = useState<CustomizeScope>({ kind: "user" });
  const [draft, setDraft] = useState<Record<string, string | boolean>>({
    relPath: "",
    body: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const groups = useMemo(() => {
    return groupsDef.map((g) => {
      const chunk = (data ?? []).find((c) => c.key === g.key);
      const rows: MdListRow[] = (chunk?.rules ?? []).map((r) => {
        const scope = r.scope ?? g.scope;
        return {
          key: `${customizeScopeKey(scope)}:${r.relPath}`,
          title: r.relPath,
          subtitle: r.name,
          badge: r.source,
          writable: r.writable !== false,
          body: r.body,
          scope,
        };
      });
      return {
        ...g,
        title:
          g.scope.kind === "user"
            ? t("customize.scope.user")
            : t("customize.scope.workspace", { name: g.name }),
        rows,
      };
    });
  }, [groupsDef, data, t]);

  return (
    <MdResourcePanel
      groups={groups}
      error={localError || error}
      emptyTitle={t("customize.rules.emptyTitle")}
      emptyBody={t("customize.rules.emptyBody")}
      addLabel={t("customize.rules.add")}
      addTitle={t("customize.rules.addTitle")}
      editTitle={t("customize.rules.editTitle")}
      fields={[
        { id: "relPath", label: t("customize.rules.fieldPath"), kind: "text" },
        { id: "body", label: t("customize.rules.fieldBody"), kind: "textarea", rows: 14 },
      ]}
      draft={draft}
      onDraftChange={setDraft}
      modalOpen={modalOpen}
      onCloseModal={() => setModalOpen(false)}
      editing={editing}
      saveDisabled={!String(draft.relPath).trim()}
      onCreate={(scope) => {
        setActiveScope(scope);
        setEditing(false);
        setDraft({ relPath: "", body: "" });
        setModalOpen(true);
      }}
      onEdit={(row) => {
        setActiveScope(row.scope);
        setEditing(true);
        setDraft({ relPath: row.title, body: row.body });
        setModalOpen(true);
      }}
      onSave={async () => {
        try {
          await api()?.upsert({
            scope: activeScope,
            relPath: String(draft.relPath),
            body: String(draft.body),
          });
          setModalOpen(false);
          setLocalError(null);
          reload();
        } catch (err) {
          setLocalError(err instanceof Error ? err.message : String(err));
        }
      }}
      onRemove={async (row) => {
        try {
          await api()?.remove(row.scope, row.title);
          setLocalError(null);
          reload();
        } catch (err) {
          setLocalError(err instanceof Error ? err.message : String(err));
        }
      }}
    />
  );
}
