/**
 * RightInspector 模态框：未保存关闭确认 + 另存为。
 */
import { Button, Field, Input, Modal } from "@thinker-workbench/design/react";
import { useT } from "../../../i18n/useI18n";
import type { StageTab } from "../types";

/** 未命名缓冲首次保存：填写相对路径。 */
type SaveAsState = {
  key: string;
  draft: string;
  /** 保存成功后关闭该标签（来自未保存关闭确认）。*/
  closeAfter?: boolean;
};

type Props = {
  closeDirtyKey: string | null;
  tabs: StageTab[];
  onCloseDirty: () => void;
  onDiscardAndClose: () => void;
  onSaveAndClose: () => void;
  saveAs: SaveAsState | null;
  onSaveAsChange: (saveAs: SaveAsState | null) => void;
  onCommitSaveAs: () => void;
};

export function InspectorModals({
  closeDirtyKey,
  tabs,
  onCloseDirty,
  onDiscardAndClose,
  onSaveAndClose,
  saveAs,
  onSaveAsChange,
  onCommitSaveAs,
}: Props) {
  const t = useT();

  return (
    <>
      <Modal
        open={Boolean(closeDirtyKey)}
        onClose={onCloseDirty}
        closeOnBackdrop
        closeOnEscape
        aria-labelledby="inspector-discard-title"
      >
        <h2 id="inspector-discard-title" className="components-modal-title">
          {t("inspector.files.discardConfirm")}
        </h2>
        <p className="components-modal-body">
          {t("inspector.files.discardConfirmBody", {
            name:
              tabs.find((tab) => tab.key === closeDirtyKey)?.title || t("inspector.files.untitled"),
          })}
        </p>
        <div className="components-row components-row--end">
          <Button variant="ghost" onClick={onCloseDirty}>
            {t("inspector.files.discardCancel")}
          </Button>
          <Button variant="danger" onClick={onDiscardAndClose}>
            {t("inspector.files.discardDontSave")}
          </Button>
          <Button variant="primary" onClick={() => onSaveAndClose()}>
            {t("inspector.files.save")}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(saveAs)}
        onClose={() => onSaveAsChange(null)}
        closeOnBackdrop
        closeOnEscape
        aria-label={t("inspector.files.saveAsTitle")}
      >
        <h2 className="components-modal-title">{t("inspector.files.saveAsTitle")}</h2>
        {saveAs ? (
          <Field label={t("inspector.files.newFilePrompt")} htmlFor="inspector-save-as">
            <Input
              id="inspector-save-as"
              value={saveAs.draft}
              autoFocus
              onChange={(e) => onSaveAsChange({ ...saveAs, draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitSaveAs();
              }}
            />
          </Field>
        ) : null}
        <div className="components-row components-row--end">
          <Button variant="ghost" onClick={() => onSaveAsChange(null)}>
            {t("inspector.files.saveAsCancel")}
          </Button>
          <Button variant="primary" onClick={() => onCommitSaveAs()}>
            {t("inspector.files.save")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
