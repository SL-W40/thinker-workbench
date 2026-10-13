/**
 * Customize 通用 markdown 资源列表面板（Skills / Rules / Subagents）。
 * 按作用域分组展开，组内可空状态。
 */
import {
  Badge,
  Button,
  Callout,
  CloseIcon,
  Field,
  IconButton,
  Input,
  Modal,
  Switch,
  TextArea,
} from "@thinker-workbench/design/react";
import type { CustomizeScope } from "@thinker-workbench/shared";
import { type ReactNode, useState } from "react";
import { useT } from "../../i18n/useI18n";
import { ScopeGroupSection } from "./ScopeGroupSection";
import type { ScopeGroupDef } from "./scopeHelpers";

export type MdListRow = {
  key: string;
  title: string;
  subtitle?: string;
  badge?: string;
  writable?: boolean;
  body: string;
  scope: CustomizeScope;
};

type DraftField = {
  id: string;
  label: string;
  kind: "text" | "textarea" | "switch";
  rows?: number;
  description?: string;
};

export type MdResourceGroup = ScopeGroupDef & {
  title: string;
  rows: MdListRow[];
};

type Props = {
  groups: MdResourceGroup[];
  loading?: boolean;
  error?: string | null;
  emptyTitle: string;
  emptyBody: string;
  addLabel: string;
  editTitle: string;
  addTitle: string;
  fields: DraftField[];
  draft: Record<string, string | boolean>;
  onDraftChange: (next: Record<string, string | boolean>) => void;
  onCreate: (scope: CustomizeScope) => void;
  onEdit: (row: MdListRow) => void;
  onSave: () => Promise<void>;
  onRemove: (row: MdListRow) => Promise<void>;
  /** 某一组标题栏额外操作。 */
  groupExtra?: (group: MdResourceGroup) => ReactNode;
  /** 每一行操作区（编辑 / 删除左侧）的额外按钮。 */
  rowActions?: (row: MdListRow) => ReactNode;
  /** 模态框表单底部额外区域。 */
  modalExtra?: ReactNode;
  modalOpen: boolean;
  onCloseModal: () => void;
  editing: boolean;
  saveDisabled?: boolean;
};

/** 分组列表 + 模态编辑。 */
export function MdResourcePanel({
  groups,
  loading,
  error,
  emptyTitle,
  emptyBody,
  addLabel,
  editTitle,
  addTitle,
  fields,
  draft,
  onDraftChange,
  onCreate,
  onEdit,
  onSave,
  onRemove,
  groupExtra,
  rowActions,
  modalExtra,
  modalOpen,
  onCloseModal,
  editing,
  saveDisabled,
}: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  return (
    <div className="customize-panel">
      {error ? (
        <Callout tone="danger" className="customize-panel__banner">
          {error}
        </Callout>
      ) : null}
      {loading ? (
        <p className="customize-panel__muted">{t("customize.loading")}</p>
      ) : (
        <div className="customize-panel__groups">
          {groups.map((group) => (
            <ScopeGroupSection
              key={group.key}
              title={group.title}
              count={group.rows.length}
              addLabel={addLabel}
              onAdd={() => onCreate(group.scope)}
              emptyTitle={emptyTitle}
              emptyBody={emptyBody}
              isEmpty={group.rows.length === 0}
              headerExtra={groupExtra?.(group)}
            >
              <ul className="customize-panel__list">
                {group.rows.map((row) => (
                  <li key={row.key} className="customize-panel__row">
                    <div className="customize-panel__meta">
                      <span className="customize-panel__name">{row.title}</span>
                      {row.subtitle ? (
                        <span className="customize-panel__sub">{row.subtitle}</span>
                      ) : null}
                      {row.badge ? <Badge variant="neutral">{row.badge}</Badge> : null}
                      {row.writable === false ? (
                        <Badge variant="accent">{t("customize.readonly")}</Badge>
                      ) : null}
                    </div>
                    <div className="customize-panel__row-actions">
                      {rowActions?.(row)}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={row.writable === false}
                        onClick={() => onEdit(row)}
                      >
                        {t("customize.edit")}
                      </Button>
                      <IconButton
                        size="sm"
                        variant="ghost"
                        aria-label={t("customize.remove")}
                        disabled={row.writable === false}
                        onClick={() => {
                          void onRemove(row);
                        }}
                      >
                        <CloseIcon />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            </ScopeGroupSection>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={onCloseModal}
        closeOnBackdrop
        closeOnEscape
        aria-label={editing ? editTitle : addTitle}
      >
        <div className="customize-panel__form">
          <h2 className="customize-panel__modal-title">{editing ? editTitle : addTitle}</h2>
          {fields.map((f) => (
            <Field key={f.id} label={f.label} description={f.description}>
              {f.kind === "switch" ? (
                <Switch
                  checked={Boolean(draft[f.id])}
                  onChange={(checked) => onDraftChange({ ...draft, [f.id]: checked })}
                  aria-label={f.label}
                />
              ) : f.kind === "textarea" ? (
                <TextArea
                  rows={f.rows ?? 8}
                  value={String(draft[f.id] ?? "")}
                  onChange={(e) => onDraftChange({ ...draft, [f.id]: e.target.value })}
                />
              ) : (
                <Input
                  value={String(draft[f.id] ?? "")}
                  disabled={editing && (f.id === "name" || f.id === "relPath")}
                  onChange={(e) => onDraftChange({ ...draft, [f.id]: e.target.value })}
                />
              )}
            </Field>
          ))}
          {modalExtra}
          <div className="customize-panel__modal-actions">
            <Button
              size="sm"
              variant="primary"
              disabled={busy || saveDisabled}
              onClick={() => {
                setBusy(true);
                void onSave().finally(() => setBusy(false));
              }}
            >
              {t("customize.save")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
