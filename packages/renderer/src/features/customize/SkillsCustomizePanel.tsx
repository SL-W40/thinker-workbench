/**
 * Customize → Skills：按用户 / 各工作区分组展示。
 */
import type { CustomizeScope, SkillListItem, WorkspaceRecord } from "@thinker-workbench/shared";
import { useMemo, useState } from "react";
import { useT } from "../../ui/i18n/useI18n";
import { type MdListRow, MdResourcePanel } from "./MdResourcePanel";
import { buildScopeGroups, customizeScopeKey, sameCustomizeScope } from "./scopeHelpers";
import { useLoadWhen } from "./useLoadWhen";

type Props = {
  workspaces: WorkspaceRecord[];
};

function api() {
  return window.thinker?.skills;
}

export function SkillsCustomizePanel({ workspaces }: Props) {
  const t = useT();
  const groupsDef = useMemo(() => buildScopeGroups(workspaces), [workspaces]);
  const rootsKey = groupsDef.map((g) => g.workspaceRoot ?? "").join("|");

  const { data, error, reload } = useLoadWhen(async () => {
    const chunks = await Promise.all(
      groupsDef.map(async (g) => {
        const res = await api()?.listDetailed?.(g.workspaceRoot);
        const skills = (res?.skills ?? []).filter((s: SkillListItem) =>
          sameCustomizeScope(s.scope, g.scope),
        );
        return { key: g.key, skills };
      }),
    );
    return chunks;
  }, [rootsKey]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeScope, setActiveScope] = useState<CustomizeScope>({ kind: "user" });
  const [draft, setDraft] = useState<Record<string, string | boolean>>({
    name: "",
    description: "",
    body: "",
    disableModelInvocation: false,
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const allSkills = useMemo(() => {
    const map = new Map<string, SkillListItem>();
    for (const chunk of data ?? []) {
      for (const s of chunk.skills) {
        const scope = s.scope ?? { kind: "user" as const };
        map.set(`${customizeScopeKey(scope)}:${s.name}`, s);
      }
    }
    return map;
  }, [data]);

  const groups = useMemo(() => {
    return groupsDef.map((g) => {
      const chunk = (data ?? []).find((c) => c.key === g.key);
      const rows: MdListRow[] = (chunk?.skills ?? []).map((s) => {
        const scope = s.scope ?? g.scope;
        return {
          key: `${customizeScopeKey(scope)}:${s.name}`,
          title: s.name,
          subtitle: s.description,
          badge: s.customizeSource ?? s.source,
          writable: s.writable !== false,
          body: s.body ?? "",
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
      emptyTitle={t("customize.skills.emptyTitle")}
      emptyBody={t("customize.skills.emptyBody")}
      addLabel={t("customize.skills.add")}
      addTitle={t("customize.skills.addTitle")}
      editTitle={t("customize.skills.editTitle")}
      fields={[
        { id: "name", label: t("customize.skills.fieldName"), kind: "text" },
        { id: "description", label: t("customize.skills.fieldDescription"), kind: "text" },
        {
          id: "disableModelInvocation",
          label: t("customize.skills.fieldSlashOnly"),
          kind: "switch",
          description: t("customize.skills.slashOnlyHint"),
        },
        { id: "body", label: t("customize.skills.fieldBody"), kind: "textarea", rows: 12 },
      ]}
      draft={draft}
      onDraftChange={setDraft}
      modalOpen={modalOpen}
      onCloseModal={() => setModalOpen(false)}
      editing={editing}
      saveDisabled={!String(draft.name).trim() || !String(draft.description).trim()}
      onCreate={(scope) => {
        setActiveScope(scope);
        setEditing(false);
        setDraft({
          name: "",
          description: "",
          body: "",
          disableModelInvocation: false,
        });
        setModalOpen(true);
      }}
      onEdit={(row) => {
        const src = allSkills.get(row.key);
        setActiveScope(row.scope);
        setEditing(true);
        setDraft({
          name: row.title,
          description: src?.description ?? row.subtitle ?? "",
          body: src?.body ?? row.body,
          disableModelInvocation: Boolean(src?.disableModelInvocation),
        });
        setModalOpen(true);
      }}
      onSave={async () => {
        try {
          await api()?.upsert?.({
            scope: activeScope,
            name: String(draft.name),
            description: String(draft.description),
            body: String(draft.body),
            disableModelInvocation: Boolean(draft.disableModelInvocation),
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
          await api()?.remove?.(row.scope, row.title);
          setLocalError(null);
          reload();
        } catch (err) {
          setLocalError(err instanceof Error ? err.message : String(err));
        }
      }}
    />
  );
}
