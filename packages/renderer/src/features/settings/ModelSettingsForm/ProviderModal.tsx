/**
 * Provider 新增 / 编辑模态框。
 */
import { Button, Field, Input, Modal } from "@thinker-workbench/design/react";
import { useT } from "../../../ui/i18n/useI18n";
import type { ProviderForm } from "./drafts";

type Props = {
  form: ProviderForm | null;
  titleId: string;
  onClose: () => void;
  onPatch: (patch: Partial<ProviderForm>) => void;
  onSave: () => void;
};

export function ProviderModal({ form, titleId, onClose, onPatch, onSave }: Props) {
  const t = useT();

  return (
    <Modal
      open={Boolean(form)}
      onClose={onClose}
      closeOnBackdrop
      closeOnEscape
      aria-labelledby={titleId}
      panelClassName="settings-model-modal"
    >
      {form ? (
        <div className="settings-model-modal__body">
          <h2 id={titleId}>
            {form.isNew ? t("settings.model.addProvider") : t("settings.model.editProvider")}
          </h2>
          <Field label={t("settings.model.providerLabel")}>
            <Input value={form.label} onChange={(e) => onPatch({ label: e.target.value })} />
          </Field>
          <Field label={t("settings.model.apiKey")} description={t("settings.model.apiKeyHint")}>
            <Input
              type="password"
              value={form.apiKey}
              placeholder={
                form.hasApiKey
                  ? t("settings.model.apiKeySaved", { hint: form.apiKeyHint })
                  : t("settings.model.apiKeyPlaceholder")
              }
              onChange={(e) => onPatch({ apiKey: e.target.value })}
            />
          </Field>
          <Field label={t("settings.model.baseUrl")} description={t("settings.model.baseUrlHint")}>
            <Input
              type="url"
              value={form.baseUrl}
              placeholder={t("settings.model.baseUrlPlaceholder")}
              onChange={(e) => onPatch({ baseUrl: e.target.value })}
            />
          </Field>
          <div className="settings-model-modal__footer">
            <Button variant="ghost" onClick={onClose}>
              {t("settings.model.cancel")}
            </Button>
            <Button variant="primary" onClick={onSave}>
              {t("settings.model.save")}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
