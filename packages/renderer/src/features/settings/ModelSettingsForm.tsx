/**
 * 设置 → 模型：连接凭据（API Key / Base URL / 模型名）与回复偏好（emoji）。
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Field,
  Input,
  Modal,
  Select,
  Switch,
  Table,
  reorderTableRows,
} from "@thinker-workbench/design/react";
import {
  createId,
  MODEL_TAGS,
  type ModelCatalogPublic,
  type ModelEntry,
  type ModelSelection,
  type ModelTag,
} from "@thinker-workbench/shared";
import {
  getModelSettings,
  probeModel,
  setModelSettings,
} from "../../bridge/thinker";
import { useT } from "../../i18n/useI18n";

/** 输入停止后延迟再写入主进程的毫秒数。*/
const SAVE_DEBOUNCE_MS = 450;

/** 编辑中的凭证（apiKey 仅本地草稿）。*/
type ProviderDraft = {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  apiKeyHint: string;
};

type ProviderForm = {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  apiKeyHint: string;
  isNew: boolean;
};

type ModelForm = {
  id: string;
  providerId: string;
  model: string;
  label: string;
  tags: ModelTag[];
  enabled: boolean;
  isNew: boolean;
};

function toProviderDrafts(catalog: ModelCatalogPublic): ProviderDraft[] {
  return catalog.providers.map((p) => ({
    id: p.id,
    label: p.label,
    baseUrl: p.baseUrl,
    apiKey: "",
    hasApiKey: p.hasApiKey,
    apiKeyHint: p.apiKeyHint,
  }));
}

function selectionValue(sel: ModelSelection): string {
  return sel.mode === "auto" ? "auto" : sel.modelId;
}

export function ModelSettingsForm() {
  const t = useT();
  const providerTitleId = useId();
  const modelTitleId = useId();
  const [providers, setProviders] = useState<ProviderDraft[]>([]);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [allowEmoji, setAllowEmoji] = useState(false);
  const [selection, setSelection] = useState<ModelSelection>({ mode: "auto" });
  const [error, setError] = useState<string | null>(null);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderForm | null>(null);
  const [modelForm, setModelForm] = useState<ModelForm | null>(null);
  const available = Boolean(window.thinker?.settings);
  const readyRef = useRef(false);
  const skipSaveRef = useRef(false);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await getModelSettings();
        if (cancelled) return;
        skipSaveRef.current = true;
        setProviders(toProviderDrafts(next));
        setModels(next.models.map((m) => ({ ...m, tags: [...m.tags] })));
        setAllowEmoji(next.allowEmoji);
        setSelection(next.selection ?? { mode: "auto" });
        readyRef.current = true;
        queueMicrotask(() => {
          skipSaveRef.current = false;
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [available]);

  useEffect(() => {
    if (!available || !readyRef.current || skipSaveRef.current) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await setModelSettings({
            providers: providers.map((p) => ({
              id: p.id,
              label: p.label,
              baseUrl: p.baseUrl,
              ...(p.apiKey.trim() ? { apiKey: p.apiKey.trim() } : {}),
            })),
            models,
            selection,
            allowEmoji,
          });
          skipSaveRef.current = true;
          setProviders(
            next.providers.map((p) => ({
              id: p.id,
              label: p.label,
              baseUrl: p.baseUrl,
              apiKey: "",
              hasApiKey: p.hasApiKey,
              apiKeyHint: p.apiKeyHint,
            })),
          );
          setModels((prev) =>
            next.models.map((m) => {
              const local = prev.find((x) => x.id === m.id);
              return local
                ? {
                    ...local,
                    health: m.health,
                    lastError: m.lastError,
                    lastCheckedAt: m.lastCheckedAt,
                  }
                : { ...m, tags: [...m.tags] };
            }),
          );
          queueMicrotask(() => {
            skipSaveRef.current = false;
          });
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })();
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [available, providers, models, selection, allowEmoji]);

  function openAddProvider(): void {
    setProviderForm({
      id: createId("prov"),
      label: t("settings.model.providerDefaultLabel"),
      baseUrl: "",
      apiKey: "",
      hasApiKey: false,
      apiKeyHint: "",
      isNew: true,
    });
  }

  function openEditProvider(p: ProviderDraft): void {
    setProviderForm({
      id: p.id,
      label: p.label,
      baseUrl: p.baseUrl,
      apiKey: "",
      hasApiKey: p.hasApiKey,
      apiKeyHint: p.apiKeyHint,
      isNew: false,
    });
  }

  function commitProviderForm(): void {
    if (!providerForm) return;
    const next: ProviderDraft = {
      id: providerForm.id,
      label: providerForm.label.trim() || t("settings.model.providerDefaultLabel"),
      baseUrl: providerForm.baseUrl.trim(),
      apiKey: providerForm.apiKey,
      hasApiKey: providerForm.hasApiKey || Boolean(providerForm.apiKey.trim()),
      apiKeyHint: providerForm.apiKeyHint,
    };
    setProviders((prev) => {
      if (providerForm.isNew) return [...prev, next];
      return prev.map((p) => (p.id === next.id ? { ...p, ...next } : p));
    });
    setProviderForm(null);
  }

  function removeProvider(id: string): void {
    setProviders((prev) => prev.filter((p) => p.id !== id));
    setModels((prev) => prev.filter((m) => m.providerId !== id));
  }

  function openAddModel(): void {
    setModelForm({
      id: createId("mdl"),
      providerId: providers[0]?.id ?? "",
      model: "",
      label: "",
      tags: ["general"],
      enabled: true,
      isNew: true,
    });
  }

  function openEditModel(m: ModelEntry): void {
    setModelForm({
      id: m.id,
      providerId: m.providerId,
      model: m.model,
      label: m.label,
      tags: [...m.tags],
      enabled: m.enabled,
      isNew: false,
    });
  }

  function commitModelForm(): void {
    if (!modelForm) return;
    const tags = modelForm.tags.includes("general")
      ? modelForm.tags
      : (["general", ...modelForm.tags] as ModelTag[]);
    setModels((prev) => {
      if (modelForm.isNew) {
        return [
          ...prev,
          {
            id: modelForm.id,
            providerId: modelForm.providerId,
            model: modelForm.model.trim(),
            label: modelForm.label.trim(),
            tags,
            priority: prev.length,
            enabled: modelForm.enabled,
            health: "ok",
          },
        ];
      }
      return prev.map((m) =>
        m.id === modelForm.id
          ? {
              ...m,
              providerId: modelForm.providerId,
              model: modelForm.model.trim(),
              label: modelForm.label.trim(),
              tags,
              enabled: modelForm.enabled,
            }
          : m,
      );
    });
    setModelForm(null);
  }

  function removeModel(id: string): void {
    setModels((prev) => prev.filter((m) => m.id !== id));
    if (selection.mode === "manual" && selection.modelId === id) {
      setSelection({ mode: "auto" });
    }
  }

  function reorderProviders(fromIndex: number, toIndex: number): void {
    setProviders((prev) => reorderTableRows(prev, fromIndex, toIndex));
  }

  function reorderModels(fromIndex: number, toIndex: number): void {
    setModels((prev) =>
      reorderTableRows(prev, fromIndex, toIndex).map((m, i) => ({ ...m, priority: i })),
    );
  }

  function toggleFormTag(tag: ModelTag): void {
    setModelForm((prev) => {
      if (!prev) return prev;
      if (tag === "general") return prev;
      const has = prev.tags.includes(tag);
      const tags = has ? prev.tags.filter((x) => x !== tag) : [...prev.tags, tag];
      if (!tags.includes("general")) tags.unshift("general");
      return { ...prev, tags };
    });
  }

  async function onProbe(modelId: string): Promise<void> {
    try {
      await setModelSettings({
        providers: providers.map((p) => ({
          id: p.id,
          label: p.label,
          baseUrl: p.baseUrl,
          ...(p.apiKey.trim() ? { apiKey: p.apiKey.trim() } : {}),
        })),
        models,
        selection,
        allowEmoji,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    setProbingId(modelId);
    try {
      const result = await probeModel({ modelId });
      skipSaveRef.current = true;
      setModels((prev) =>
        result.catalog.models.map((m) => {
          const local = prev.find((x) => x.id === m.id);
          return local
            ? {
                ...local,
                health: m.health,
                lastError: m.lastError,
                lastCheckedAt: m.lastCheckedAt,
              }
            : { ...m, tags: [...m.tags] };
        }),
      );
      queueMicrotask(() => {
        skipSaveRef.current = false;
      });
      if (!result.ok) setError(result.error ?? t("settings.model.probeFailed"));
      else setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProbingId(null);
    }
  }

  if (!available) {
    return (
      <Callout tone="warning">{t("settings.model.unavailable", { cmd: "pnpm run dev" })}</Callout>
    );
  }

  const selectionOptions = [
    { value: "auto", label: t("settings.model.selectionAuto") },
    ...models.map((m) => ({
      value: m.id,
      label: m.label || m.model || m.id,
    })),
  ];

  const providerName = (id: string) =>
    providers.find((p) => p.id === id)?.label || id || "…";

  return (
    <div className="settings-model">
      {error ? (
        <Callout tone="danger" className="settings-model-error">
          {error}
        </Callout>
      ) : null}

      <section className="settings-model-block">
        <div className="settings-model-block__head">
          <div className="settings-theme-head">
            <strong>{t("settings.model.providers.title")}</strong>
            <span>{t("settings.model.providers.description")}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={openAddProvider}>
            {t("settings.model.addProvider")}
          </Button>
        </div>
        {providers.length === 0 ? (
          <p className="settings-model-empty">{t("settings.model.providersEmpty")}</p>
        ) : (
          <Table
            density="compact"
            scroll={false}
            cellOverflow="ellipsis"
            sortable
            sortHandleLabel={t("settings.model.dragReorder")}
            onReorder={reorderProviders}
          >
            <Table.Head>
              <Table.Row>
                <Table.Header>{t("settings.model.providerLabel")}</Table.Header>
                <Table.Header>{t("settings.model.apiKey")}</Table.Header>
                <Table.Header>{t("settings.model.baseUrl")}</Table.Header>
                <Table.Header fit>{t("settings.model.actions")}</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {providers.map((p) => {
                const keyLabel = p.hasApiKey
                  ? t("settings.model.apiKeySaved", { hint: p.apiKeyHint })
                  : t("settings.model.apiKeyMissing");
                return (
                  <Table.Row key={p.id}>
                    <Table.Cell title={p.label || undefined}>{p.label || "…"}</Table.Cell>
                    <Table.Cell muted title={keyLabel}>
                      {keyLabel}
                    </Table.Cell>
                    <Table.Cell muted title={p.baseUrl || undefined}>
                      {p.baseUrl || "…"}
                    </Table.Cell>
                    <Table.Cell align="end" fit>
                      <div className="settings-model-row-actions">
                        <Button size="sm" variant="ghost" onClick={() => openEditProvider(p)}>
                          {t("settings.model.edit")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeProvider(p.id)}>
                          {t("settings.model.remove")}
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        )}
      </section>

      <section className="settings-model-block">
        <div className="settings-model-block__head">
          <div className="settings-theme-head">
            <strong>{t("settings.model.models.title")}</strong>
            <span>{t("settings.model.models.description")}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={openAddModel}
            disabled={providers.length === 0}
          >
            {t("settings.model.addModel")}
          </Button>
        </div>
        {models.length === 0 ? (
          <p className="settings-model-empty">{t("settings.model.modelsEmpty")}</p>
        ) : (
          <Table
            density="compact"
            scroll={false}
            cellOverflow="ellipsis"
            sortable
            sortHandleLabel={t("settings.model.dragReorder")}
            onReorder={reorderModels}
          >
            <Table.Head>
              <Table.Row>
                <Table.Header fit>{t("settings.model.status")}</Table.Header>
                <Table.Header>{t("settings.model.displayName")}</Table.Header>
                <Table.Header>{t("settings.model.model")}</Table.Header>
                <Table.Header>{t("settings.model.providerLabel")}</Table.Header>
                <Table.Header>{t("settings.model.tags")}</Table.Header>
                <Table.Header fit>{t("settings.model.enabled")}</Table.Header>
                <Table.Header fit>{t("settings.model.actions")}</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {models.map((m) => {
                const statusLabel =
                  m.health === "ok"
                    ? t("settings.model.healthOk")
                    : t("settings.model.healthError");
                const statusTip =
                  m.health === "error" && m.lastError
                    ? `${statusLabel}: ${m.lastError}`
                    : statusLabel;
                const tagLabels = m.tags.map((tag) => t(`settings.model.tag.${tag}`));
                const tagTip = tagLabels.join(" · ");
                const prov = providerName(m.providerId);
                return (
                  <Table.Row key={m.id}>
                    <Table.Cell fit title={statusTip}>
                      <Badge variant={m.health === "ok" ? "success" : "danger"}>
                        {statusLabel}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell title={m.label || undefined}>{m.label || "…"}</Table.Cell>
                    <Table.Cell muted title={m.model || undefined}>
                      {m.model || "…"}
                    </Table.Cell>
                    <Table.Cell muted title={prov}>
                      {prov}
                    </Table.Cell>
                    <Table.Cell title={tagTip}>
                      <div className="settings-model-tag-chips">
                        {m.tags
                          .filter((tag) => tag !== "general")
                          .map((tag) => (
                            <Badge key={tag} variant="accent">
                              {t(`settings.model.tag.${tag}`)}
                            </Badge>
                          ))}
                        {m.tags.every((tag) => tag === "general") ? (
                          <span className="settings-model-tag-fallback">
                            {t("settings.model.tag.general")}
                          </span>
                        ) : null}
                      </div>
                    </Table.Cell>
                    <Table.Cell fit>
                      <Switch
                        checked={m.enabled}
                        onChange={(checked) =>
                          setModels((prev) =>
                            prev.map((x) => (x.id === m.id ? { ...x, enabled: checked } : x)),
                          )
                        }
                        aria-label={t("settings.model.enabled")}
                      />
                    </Table.Cell>
                    <Table.Cell align="end" fit>
                      <div className="settings-model-row-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={probingId === m.id}
                          onClick={() => void onProbe(m.id)}
                        >
                          {probingId === m.id
                            ? t("settings.model.probing")
                            : t("settings.model.probe")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEditModel(m)}>
                          {t("settings.model.edit")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeModel(m.id)}>
                          {t("settings.model.remove")}
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        )}
      </section>

      <section className="settings-model-block">
        <div className="settings-theme-head">
          <strong>{t("settings.model.defaultSelection.title")}</strong>
          <span>{t("settings.model.defaultSelection.description")}</span>
        </div>
        <Select
          value={selectionValue(selection)}
          options={selectionOptions}
          onChange={(value) => {
            if (value === "auto") setSelection({ mode: "auto" });
            else setSelection({ mode: "manual", modelId: value });
          }}
          aria-label={t("settings.model.defaultSelection.title")}
        />
      </section>

      <section className="settings-model-block">
        <div className="settings-theme-head">
          <strong>{t("settings.model.reply.title")}</strong>
          <span>{t("settings.model.reply.description")}</span>
        </div>
        <ul className="settings-toggle-list">
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.model.allowEmoji.title")}</strong>
              <span>{t("settings.model.allowEmoji.description")}</span>
            </div>
            <Switch
              checked={allowEmoji}
              aria-label={t("settings.model.allowEmoji.title")}
              onChange={(checked) => setAllowEmoji(checked)}
            />
          </li>
        </ul>
      </section>

      <Modal
        open={Boolean(providerForm)}
        onClose={() => setProviderForm(null)}
        closeOnBackdrop
        closeOnEscape
        aria-labelledby={providerTitleId}
        panelClassName="settings-model-modal"
      >
        {providerForm ? (
          <div className="settings-model-modal__body">
            <h2 id={providerTitleId}>
              {providerForm.isNew
                ? t("settings.model.addProvider")
                : t("settings.model.editProvider")}
            </h2>
            <Field label={t("settings.model.providerLabel")}>
              <Input
                value={providerForm.label}
                onChange={(e) =>
                  setProviderForm((prev) => (prev ? { ...prev, label: e.target.value } : prev))
                }
              />
            </Field>
            <Field label={t("settings.model.apiKey")} description={t("settings.model.apiKeyHint")}>
              <Input
                type="password"
                value={providerForm.apiKey}
                placeholder={
                  providerForm.hasApiKey
                    ? t("settings.model.apiKeySaved", { hint: providerForm.apiKeyHint })
                    : t("settings.model.apiKeyPlaceholder")
                }
                onChange={(e) =>
                  setProviderForm((prev) => (prev ? { ...prev, apiKey: e.target.value } : prev))
                }
              />
            </Field>
            <Field
              label={t("settings.model.baseUrl")}
              description={t("settings.model.baseUrlHint")}
            >
              <Input
                type="url"
                value={providerForm.baseUrl}
                placeholder={t("settings.model.baseUrlPlaceholder")}
                onChange={(e) =>
                  setProviderForm((prev) => (prev ? { ...prev, baseUrl: e.target.value } : prev))
                }
              />
            </Field>
            <div className="settings-model-modal__footer">
              <Button variant="ghost" onClick={() => setProviderForm(null)}>
                {t("settings.model.cancel")}
              </Button>
              <Button variant="primary" onClick={commitProviderForm}>
                {t("settings.model.save")}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(modelForm)}
        onClose={() => setModelForm(null)}
        closeOnBackdrop
        closeOnEscape
        aria-labelledby={modelTitleId}
        panelClassName="settings-model-modal"
      >
        {modelForm ? (
          <div className="settings-model-modal__body">
            <h2 id={modelTitleId}>
              {modelForm.isNew ? t("settings.model.addModel") : t("settings.model.editModel")}
            </h2>
            <Field label={t("settings.model.providerLabel")}>
              <Select
                value={modelForm.providerId}
                options={providers.map((p) => ({ value: p.id, label: p.label || p.id }))}
                onChange={(value) =>
                  setModelForm((prev) => (prev ? { ...prev, providerId: value } : prev))
                }
                aria-label={t("settings.model.providerLabel")}
              />
            </Field>
            <Field label={t("settings.model.displayName")}>
              <Input
                value={modelForm.label}
                placeholder={t("settings.model.displayNamePlaceholder")}
                onChange={(e) =>
                  setModelForm((prev) => (prev ? { ...prev, label: e.target.value } : prev))
                }
              />
            </Field>
            <Field label={t("settings.model.model")} description={t("settings.model.modelHint")}>
              <Input
                value={modelForm.model}
                placeholder={t("settings.model.modelPlaceholder")}
                onChange={(e) =>
                  setModelForm((prev) => (prev ? { ...prev, model: e.target.value } : prev))
                }
              />
            </Field>
            <div className="settings-model-tags">
              <span className="settings-model-tags__label">{t("settings.model.tags")}</span>
              {MODEL_TAGS.map((tag) => (
                <Checkbox
                  key={tag}
                  checked={modelForm.tags.includes(tag)}
                  disabled={tag === "general"}
                  onChange={() => toggleFormTag(tag)}
                  aria-label={t(`settings.model.tag.${tag}`)}
                >
                  {t(`settings.model.tag.${tag}`)}
                </Checkbox>
              ))}
            </div>
            <label className="settings-model-enabled">
              <Switch
                checked={modelForm.enabled}
                onChange={(checked) =>
                  setModelForm((prev) => (prev ? { ...prev, enabled: checked } : prev))
                }
                aria-label={t("settings.model.enabled")}
              />
              <span>{t("settings.model.enabled")}</span>
            </label>
            <div className="settings-model-modal__footer">
              <Button variant="ghost" onClick={() => setModelForm(null)}>
                {t("settings.model.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={commitModelForm}
                disabled={!modelForm.providerId}
              >
                {t("settings.model.save")}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
