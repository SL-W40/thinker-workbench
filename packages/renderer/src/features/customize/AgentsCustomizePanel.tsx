/**
 * Customize → Subagents：按用户 / 各工作区分组展示。
 */
import type {
  CustomizeScope,
  SubagentDefinition,
  WorkspaceRecord,
} from "@thinker-workbench/shared";
import { useMemo, useState } from "react";
import { useT } from "../../ui/i18n/useI18n";
import { type MdListRow, MdResourcePanel } from "./MdResourcePanel";
import { buildScopeGroups, customizeScopeKey, sameCustomizeScope } from "./scopeHelpers";
import { useLoadWhen } from "./useLoadWhen";

type Props = {
  workspaces: WorkspaceRecord[];
};

function api() {
  return window.thinker?.agents;
}

export function AgentsCustomizePanel({ workspaces }: Props) {
  const t = useT();
  const groupsDef = useMemo(() => buildScopeGroups(workspaces), [workspaces]);
  const rootsKey = groupsDef.map((g) => g.workspaceRoot ?? "").join("|");

  const { data, error, reload } = useLoadWhen(async () => {
    const chunks = await Promise.all(
      groupsDef.map(async (g) => {
        const res = await api()?.list(g.workspaceRoot);
        const agents = (res?.agents ?? []).filter((a: SubagentDefinition) =>
          sameCustomizeScope(a.scope, g.scope),
        );
        return { key: g.key, agents };
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
    model: "inherit",
    readonly: false,
    isBackground: false,
    body: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const allAgents = useMemo(() => {
    const map = new Map<string, SubagentDefinition>();
    for (const chunk of data ?? []) {
      for (const a of chunk.agents) {
        const scope = a.scope ?? { kind: "user" as const };
        map.set(`${customizeScopeKey(scope)}:${a.name}`, a);
      }
    }
    return map;
  }, [data]);

  const groups = useMemo(() => {
    return groupsDef.map((g) => {
      const chunk = (data ?? []).find((c) => c.key === g.key);
      const rows: MdListRow[] = (chunk?.agents ?? []).map((a) => {
        const scope = a.scope ?? g.scope;
        return {
          key: `${customizeScopeKey(scope)}:${a.name}`,
          title: a.name,
          subtitle: a.description,
          badge: a.source,
          writable: a.writable !== false,
          body: a.body,
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
      emptyTitle={t("customize.agents.emptyTitle")}
      emptyBody={t("customize.agents.emptyBody")}
      addLabel={t("customize.agents.add")}
      addTitle={t("customize.agents.addTitle")}
      editTitle={t("customize.agents.editTitle")}
      fields={[
        { id: "name", label: t("customize.agents.fieldName"), kind: "text" },
        { id: "description", label: t("customize.agents.fieldDescription"), kind: "text" },
        { id: "model", label: t("customize.agents.fieldModel"), kind: "text" },
        {
          id: "readonly",
          label: t("customize.agents.fieldReadonly"),
          kind: "switch",
          description: t("customize.agents.readonlyHint"),
        },
        {
          id: "isBackground",
          label: t("customize.agents.fieldBackground"),
          kind: "switch",
        },
        { id: "body", label: t("customize.agents.fieldBody"), kind: "textarea", rows: 12 },
      ]}
      draft={draft}
      onDraftChange={setDraft}
      modalOpen={modalOpen}
      onCloseModal={() => setModalOpen(false)}
      editing={editing}
      saveDisabled={!String(draft.name).trim()}
      onCreate={(scope) => {
        setActiveScope(scope);
        setEditing(false);
        setDraft({
          name: "",
          description: "",
          model: "inherit",
          readonly: false,
          isBackground: false,
          body: "",
        });
        setModalOpen(true);
      }}
      onEdit={(row) => {
        const src = allAgents.get(row.key);
        setActiveScope(row.scope);
        setEditing(true);
        setDraft({
          name: row.title,
          description: src?.description ?? row.subtitle ?? "",
          model: src?.model ?? "inherit",
          readonly: Boolean(src?.readonly),
          isBackground: Boolean(src?.isBackground),
          body: src?.body ?? row.body,
        });
        setModalOpen(true);
      }}
      onSave={async () => {
        try {
          await api()?.upsert({
            scope: activeScope,
            name: String(draft.name),
            description: String(draft.description),
            model: String(draft.model || "inherit"),
            readonly: Boolean(draft.readonly),
            isBackground: Boolean(draft.isBackground),
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
