/**
 * 自定义主题编辑器：Meta / UI / Markdown / Mermaid token，实时预览。
 */
import { useEffect, useMemo, useState } from "react";
import { UI_TOKEN_KEYS } from "@thinker-workbench/design";
import {
  Button,
  Field,
  Input,
  Modal,
  SegmentedControl,
  Select,
  TextArea,
} from "@thinker-workbench/design/react";
import { MD_TOKEN_KEYS } from "@thinker-workbench/markdown";
import type { CustomThemeRecord } from "@thinker-workbench/shared";
import { useAppearance } from "../../theme/AppearanceProvider";
import { useT } from "../../i18n/I18nProvider";
import { cloneCustomThemeRecord, looksLikeColor, toColorInputValue } from "./customThemeUtils";
import "./CustomThemeEditor.less";

type EditorTab = "meta" | "ui" | "markdown" | "mermaid";

type Props = {
  open: boolean;
  /** 编辑中的记录（打开时克隆进本地 state）。 */
  record: CustomThemeRecord | null;
  /** 预览时合并用的完整目录（不含正在编辑的旧版时由父级提供）。 */
  customsBaseline: readonly CustomThemeRecord[];
  onClose: () => void;
  onSave: (record: CustomThemeRecord) => void | Promise<void>;
};

const MERMAID_THEME_OPTS = ["default", "dark", "forest", "neutral", "base"] as const;
const MERMAID_LOOK_OPTS = ["classic", "handDrawn", "neo"] as const;

/** 单行 token 编辑：颜色则附带 color input。 */
function TokenRow({
  tokenKey,
  value,
  onChange,
}: {
  tokenKey: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const colorish = looksLikeColor(value);
  return (
    <label className="custom-theme-token">
      <span className="custom-theme-token-key" title={tokenKey}>
        {tokenKey}
      </span>
      <span className="custom-theme-token-controls">
        {colorish ? (
          <input
            type="color"
            className="custom-theme-color"
            value={toColorInputValue(value)}
            onChange={(e) => onChange(e.target.value)}
            aria-label={tokenKey}
          />
        ) : null}
        <Input
          className="custom-theme-token-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          aria-label={tokenKey}
        />
      </span>
    </label>
  );
}

export function CustomThemeEditor({
  open,
  record,
  customsBaseline,
  onClose,
  onSave,
}: Props) {
  const t = useT();
  const { typeStyle, applyAppearance } = useAppearance();
  const [draft, setDraft] = useState<CustomThemeRecord | null>(null);
  const [tab, setTab] = useState<EditorTab>("meta");
  const [busy, setBusy] = useState(false);
  const [varsText, setVarsText] = useState("{}");

  // 打开时克隆进草稿，并即时预览
  useEffect(() => {
    if (!open || !record) {
      setDraft(null);
      return;
    }
    const next = cloneCustomThemeRecord(record);
    setDraft(next);
    setTab("meta");
    setVarsText(JSON.stringify(next.theme.mermaid.themeVariables ?? {}, null, 2));
    const merged = [
      ...customsBaseline.filter((c) => c.id !== next.id),
      next,
    ];
    applyAppearance(next.id, typeStyle, merged);
  }, [open, record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabOptions = useMemo(
    () =>
      (
        [
          ["meta", t("settings.general.theme.custom.tabMeta")],
          ["ui", t("settings.general.theme.custom.tabUi")],
          ["markdown", t("settings.general.theme.custom.tabMarkdown")],
          ["mermaid", t("settings.general.theme.custom.tabMermaid")],
        ] as const
      ).map(([value, label]) => ({ value, label })),
    [t],
  );

  function preview(next: CustomThemeRecord) {
    const merged = [
      ...customsBaseline.filter((c) => c.id !== next.id),
      next,
    ];
    applyAppearance(next.id, typeStyle, merged);
  }

  function patchDraft(updater: (prev: CustomThemeRecord) => CustomThemeRecord) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      preview(next);
      return next;
    });
  }

  function setUiToken(key: string, value: string) {
    patchDraft((prev) => ({
      ...prev,
      theme: { ...prev.theme, ui: { ...prev.theme.ui, [key]: value } },
    }));
  }

  function setMdToken(key: string, value: string) {
    patchDraft((prev) => ({
      ...prev,
      theme: { ...prev.theme, markdown: { ...prev.theme.markdown, [key]: value } },
    }));
  }

  async function handleSave() {
    if (!draft) return;
    setBusy(true);
    try {
      let mermaidVars = draft.theme.mermaid.themeVariables ?? {};
      try {
        const parsed = JSON.parse(varsText) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          mermaidVars = {};
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === "string") mermaidVars[k] = v;
          }
        }
      } catch {
        /* 保留原 themeVariables */
      }
      const toSave: CustomThemeRecord = {
        ...draft,
        name: draft.name.trim() || draft.id,
        theme: {
          ...draft.theme,
          mermaid: {
            ...draft.theme.mermaid,
            themeVariables: mermaidVars,
          },
        },
      };
      await onSave(toSave);
      // 由父级关闭；勿走 onClose，以免把预览回滚到保存前主题
    } finally {
      setBusy(false);
    }
  }

  const uiKeys = useMemo(() => {
    const fromTheme = draft ? Object.keys(draft.theme.ui) : [];
    return [...new Set([...UI_TOKEN_KEYS, ...fromTheme])].sort();
  }, [draft]);

  const mdKeys = useMemo(() => {
    const fromTheme = draft ? Object.keys(draft.theme.markdown) : [];
    return [...new Set([...MD_TOKEN_KEYS, ...fromTheme])].sort();
  }, [draft]);

  return (
    <Modal
      open={open && Boolean(draft)}
      onClose={busy ? undefined : onClose}
      closeOnBackdrop
      closeOnEscape
      aria-labelledby="custom-theme-editor-title"
      panelClassName="custom-theme-editor-panel"
    >
      {draft ? (
        <div className="custom-theme-editor">
          <header className="custom-theme-editor-head">
            <h2 id="custom-theme-editor-title">{t("settings.general.theme.custom.editTitle")}</h2>
            <SegmentedControl
              value={tab}
              options={tabOptions}
              onChange={(v) => setTab(v as EditorTab)}
              aria-label={t("settings.general.theme.custom.editTitle")}
            />
          </header>

          <div className="custom-theme-editor-body">
            {tab === "meta" ? (
              <div className="custom-theme-meta">
                <Field label={t("settings.general.theme.custom.name")}>
                  <Input
                    value={draft.name}
                    onChange={(e) =>
                      patchDraft((prev) => ({ ...prev, name: e.target.value.slice(0, 64) }))
                    }
                    maxLength={64}
                  />
                </Field>
                <Field label={t("settings.general.theme.custom.colorScheme")}>
                  <Select
                    value={draft.theme.colorScheme ?? "light"}
                    options={[
                      { value: "light", label: t("settings.general.theme.custom.schemeLight") },
                      { value: "dark", label: t("settings.general.theme.custom.schemeDark") },
                    ]}
                    onChange={(v) =>
                      patchDraft((prev) => ({
                        ...prev,
                        theme: {
                          ...prev.theme,
                          colorScheme: v === "dark" ? "dark" : "light",
                        },
                      }))
                    }
                  />
                </Field>
                {draft.basedOn ? (
                  <p className="custom-theme-based-on">
                    {t("settings.general.theme.custom.basedOn", { id: draft.basedOn })}
                  </p>
                ) : null}
              </div>
            ) : null}

            {tab === "ui" ? (
              <div className="custom-theme-token-list">
                {uiKeys.map((key) => (
                  <TokenRow
                    key={key}
                    tokenKey={key}
                    value={draft.theme.ui[key] ?? ""}
                    onChange={(v) => setUiToken(key, v)}
                  />
                ))}
              </div>
            ) : null}

            {tab === "markdown" ? (
              <div className="custom-theme-token-list">
                {mdKeys.map((key) => (
                  <TokenRow
                    key={key}
                    tokenKey={key}
                    value={draft.theme.markdown[key] ?? ""}
                    onChange={(v) => setMdToken(key, v)}
                  />
                ))}
              </div>
            ) : null}

            {tab === "mermaid" ? (
              <div className="custom-theme-meta">
                <Field label={t("settings.general.theme.custom.mermaidTheme")}>
                  <Select
                    value={draft.theme.mermaid.theme ?? "neutral"}
                    options={MERMAID_THEME_OPTS.map((v) => ({ value: v, label: v }))}
                    onChange={(v) =>
                      patchDraft((prev) => ({
                        ...prev,
                        theme: {
                          ...prev.theme,
                          mermaid: { ...prev.theme.mermaid, theme: v },
                        },
                      }))
                    }
                  />
                </Field>
                <Field label={t("settings.general.theme.custom.mermaidLook")}>
                  <Select
                    value={draft.theme.mermaid.look ?? "classic"}
                    options={MERMAID_LOOK_OPTS.map((v) => ({ value: v, label: v }))}
                    onChange={(v) =>
                      patchDraft((prev) => ({
                        ...prev,
                        theme: {
                          ...prev.theme,
                          mermaid: { ...prev.theme.mermaid, look: v },
                        },
                      }))
                    }
                  />
                </Field>
                <Field
                  label={t("settings.general.theme.custom.mermaidVars")}
                  description={t("settings.general.theme.custom.mermaidVarsHint")}
                >
                  <TextArea
                    value={varsText}
                    onChange={(e) => setVarsText(e.target.value)}
                    rows={8}
                    spellCheck={false}
                  />
                </Field>
              </div>
            ) : null}
          </div>

          <footer className="custom-theme-editor-actions">
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              {t("settings.general.theme.custom.cancel")}
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void handleSave()}>
              {t("settings.general.theme.custom.save")}
            </Button>
          </footer>
        </div>
      ) : null}
    </Modal>
  );
}
