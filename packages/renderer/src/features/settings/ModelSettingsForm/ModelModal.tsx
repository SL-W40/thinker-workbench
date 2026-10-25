/**
 * Model 新增 / 编辑模态框。
 */
import {
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  Select,
  Switch,
} from "@thinker-workbench/design/react";
import { MODEL_TAGS, type ModelTag } from "@thinker-workbench/shared";
import { useT } from "../../../ui/i18n/useI18n";
import type { ModelForm, ProviderDraft } from "./drafts";

type Props = {
  form: ModelForm | null;
  titleId: string;
  providers: ProviderDraft[];
  onClose: () => void;
  onPatch: (patch: Partial<ModelForm>) => void;
  onToggleTag: (tag: ModelTag) => void;
  onSave: () => void;
};

export function ModelModal({
  form,
  titleId,
  providers,
  onClose,
  onPatch,
  onToggleTag,
  onSave,
}: Props) {
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
            {form.isNew ? t("settings.model.addModel") : t("settings.model.editModel")}
          </h2>
          <Field label={t("settings.model.providerLabel")}>
            <Select
              value={form.providerId}
              options={providers.map((p) => ({ value: p.id, label: p.label || p.id }))}
              onChange={(value) => onPatch({ providerId: value })}
              aria-label={t("settings.model.providerLabel")}
            />
          </Field>
          <Field label={t("settings.model.displayName")}>
            <Input
              value={form.label}
              placeholder={t("settings.model.displayNamePlaceholder")}
              onChange={(e) => onPatch({ label: e.target.value })}
            />
          </Field>
          <Field label={t("settings.model.model")} description={t("settings.model.modelHint")}>
            <Input
              value={form.model}
              placeholder={t("settings.model.modelPlaceholder")}
              onChange={(e) => onPatch({ model: e.target.value })}
            />
          </Field>
          <Field
            label={t("settings.model.contextWindow")}
            description={t("settings.model.contextWindowHint")}
          >
            <Input
              type="number"
              value={form.contextWindow}
              placeholder={t("settings.model.contextWindowPlaceholder")}
              onChange={(e) => onPatch({ contextWindow: e.target.value })}
            />
          </Field>
          <Field label={t("settings.model.tags")}>
            <div className="settings-model-tags__grid">
              {MODEL_TAGS.filter((tag) => tag !== "vision").map((tag) => (
                <Checkbox
                  key={tag}
                  checked={form.tags.includes(tag)}
                  disabled={tag === "general"}
                  onChange={() => onToggleTag(tag)}
                  aria-label={t(`settings.model.tag.${tag}`)}
                >
                  {t(`settings.model.tag.${tag}`)}
                </Checkbox>
              ))}
            </div>
          </Field>
          <div className="settings-model-vision">
            <div className="settings-model-vision__copy">
              <strong>{t("settings.model.vision.title")}</strong>
              <span>{t("settings.model.vision.description")}</span>
            </div>
            <Switch
              checked={form.tags.includes("vision")}
              onChange={() => onToggleTag("vision")}
              aria-label={t("settings.model.vision.title")}
            />
          </div>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: Switch 组件渲染为 button + role="switch"，原生 label 关联对其不适用 */}
          <label className="settings-model-enabled">
            <Switch
              checked={form.enabled}
              onChange={(checked) => onPatch({ enabled: checked })}
              aria-label={t("settings.model.enabled")}
            />
            <span>{t("settings.model.enabled")}</span>
          </label>
          <div className="settings-model-modal__footer">
            <Button variant="ghost" onClick={onClose}>
              {t("settings.model.cancel")}
            </Button>
            <Button variant="primary" onClick={onSave} disabled={!form.providerId}>
              {t("settings.model.save")}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
