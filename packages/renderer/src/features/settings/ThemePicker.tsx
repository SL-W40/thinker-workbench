/**
 * 通用设置中的主题色卡片选择器（基础 / 创意 / 自定义）。
 * 先 `applyAppearance` 即时预览；`onSelect` 返回 false 时回滚到已保存主题。
 */
import { useRef, useState } from "react";
import {
  Button,
  ChoiceCard,
  Modal,
  Select,
  listDesignThemes,
  resolveDesignTheme,
  resolveUiTheme,
} from "@thinker-workbench/design/react";
import {
  APP_THEME_BASE_IDS,
  APP_THEME_CREATIVE_IDS,
  MAX_CUSTOM_THEMES,
  parseCustomThemeExport,
  toCustomThemeExport,
  type AppThemeId,
  type AppTypeStyle,
  type BuiltinAppThemeId,
  type CustomThemeRecord,
} from "@thinker-workbench/shared";
import { useAppearance } from "../../theme/AppearanceProvider";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/translate";
import { CustomThemeEditor } from "./CustomThemeEditor";
import { forkCustomTheme } from "./customThemeUtils";

const THEME_LABEL: Record<BuiltinAppThemeId, MessageKey> = {
  light: "settings.general.theme.light",
  dark: "settings.general.theme.dark",
  system: "settings.general.theme.system",
  notes: "settings.general.theme.notes",
  eyecare: "settings.general.theme.eyecare",
  aurora: "settings.general.theme.aurora",
};

const THEME_DESC: Record<BuiltinAppThemeId, MessageKey> = {
  light: "settings.general.theme.lightDesc",
  dark: "settings.general.theme.darkDesc",
  system: "settings.general.theme.systemDesc",
  notes: "settings.general.theme.notesDesc",
  eyecare: "settings.general.theme.eyecareDesc",
  aurora: "settings.general.theme.auroraDesc",
};

type Props = {
  /** 当前已持久化的主题。 */
  savedTheme: AppThemeId;
  /** 与主题一并 compose 的字型（预览时保持不变）。 */
  typeStyle: AppTypeStyle;
  /** 自定义主题目录。 */
  customThemes?: CustomThemeRecord[];
  /** 返回 `false` 时将实时主题回滚。 */
  onSelect: (theme: AppThemeId) => boolean | Promise<boolean>;
  /**
   * 自定义目录变更；可选同时选中 `selectId`。
   * 返回 `false` 时回滚外观。
   */
  onCustomThemesChange?: (
    next: CustomThemeRecord[],
    selectId?: AppThemeId,
  ) => boolean | Promise<boolean>;
  /** 是否显示标题与说明；引导页可关掉以免与步骤文案重复。默认 true。 */
  showIntro?: boolean;
  /** 是否展示自定义主题管理。默认 true；引导页应 false。 */
  allowCustom?: boolean;
};

/** 主题色卡色板：`system` 用浅/深各半示意。 */
function ThemeSwatch({
  id,
  customs,
}: {
  id: AppThemeId;
  customs: readonly CustomThemeRecord[];
}) {
  if (id === "system") {
    const light = resolveDesignTheme("light");
    const dark = resolveDesignTheme("dark");
    return (
      <span
        className="settings-theme-swatch settings-theme-swatch-system"
        style={{ borderColor: light.ui["--tw-border"] }}
        aria-hidden
      >
        <span className="settings-theme-swatch-half" style={{ background: light.ui["--tw-bg"] }}>
          <span
            className="settings-theme-swatch-chip"
            style={{ background: light.ui["--tw-accent"] }}
          />
        </span>
        <span className="settings-theme-swatch-half" style={{ background: dark.ui["--tw-bg"] }}>
          <span
            className="settings-theme-swatch-chip"
            style={{ background: dark.ui["--tw-accent"] }}
          />
        </span>
      </span>
    );
  }

  const theme = resolveUiTheme(id, customs, false);
  return (
    <span
      className="settings-theme-swatch"
      style={{
        background: theme.ui["--tw-bg"],
        color: theme.ui["--tw-fg"],
        borderColor: theme.ui["--tw-border"],
      }}
      aria-hidden
    >
      <span className="settings-theme-swatch-bar" style={{ background: theme.ui["--tw-panel"] }} />
      <span className="settings-theme-swatch-chip" style={{ background: theme.ui["--tw-accent"] }} />
    </span>
  );
}

function readPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function ThemePicker({
  savedTheme,
  typeStyle,
  customThemes = [],
  onSelect,
  onCustomThemesChange,
  showIntro = true,
  allowCustom = true,
}: Props) {
  const { t } = useI18n();
  const { themeId, applyAppearance, customThemes: liveCustoms } = useAppearance();
  const customs = customThemes.length ? customThemes : liveCustoms;
  const fileRef = useRef<HTMLInputElement>(null);

  const [forkOpen, setForkOpen] = useState(false);
  const [forkSource, setForkSource] = useState<string>("light");
  const [editing, setEditing] = useState<CustomThemeRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomThemeRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const byId = new Map(listDesignThemes().map((theme) => [theme.id, theme]));
  const activeId = themeId;

  const forkOptions = [
    ...APP_THEME_BASE_IDS.filter((id) => id !== "system").map((id) => ({
      value: id,
      label: t(THEME_LABEL[id]),
    })),
    ...APP_THEME_CREATIVE_IDS.map((id) => ({
      value: id,
      label: t(THEME_LABEL[id]),
    })),
    ...customs.map((c) => ({
      value: c.id,
      label: c.name,
    })),
  ];

  /** 选中主题：即时预览 → 持久化；失败则回滚。 */
  async function choose(id: AppThemeId) {
    if (id === activeId && id === savedTheme) return;
    const previous = savedTheme;
    applyAppearance(id, typeStyle, customs);
    const ok = await onSelect(id);
    if (!ok) applyAppearance(previous, typeStyle, customs);
  }

  async function persistCustoms(next: CustomThemeRecord[], selectId?: AppThemeId) {
    if (!onCustomThemesChange) return false;
    const previousTheme = savedTheme;
    const previousCustoms = customs;
    if (selectId) applyAppearance(selectId, typeStyle, next);
    else applyAppearance(themeId, typeStyle, next);
    const ok = await onCustomThemesChange(next, selectId);
    if (!ok) {
      applyAppearance(previousTheme, typeStyle, previousCustoms);
      return false;
    }
    return true;
  }

  /** 从指定源克隆并打开编辑器（不先持久化）。 */
  function openForkedEditor(sourceId: string) {
    if (customs.length >= MAX_CUSTOM_THEMES) {
      setActionError(t("settings.general.theme.custom.limitReached", { n: String(MAX_CUSTOM_THEMES) }));
      return;
    }
    setActionError(null);
    const record = forkCustomTheme({
      sourceId,
      customs,
      prefersDark: readPrefersDark(),
      name: t("settings.general.theme.custom.defaultName"),
    });
    setEditing(record);
  }

  /** 直接新建：默认从 light 派生，无需选源。 */
  function createNew() {
    openForkedEditor("light");
  }

  function createFromSource() {
    openForkedEditor(forkSource);
    setForkOpen(false);
  }

  async function saveEdited(record: CustomThemeRecord) {
    const exists = customs.some((c) => c.id === record.id);
    const next = exists
      ? customs.map((c) => (c.id === record.id ? record : c))
      : [...customs, record];
    setActionError(null);
    const ok = await persistCustoms(next, record.id);
    if (!ok) setActionError(t("settings.general.theme.custom.saveFailed"));
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const next = customs.filter((c) => c.id !== deleteTarget.id);
    const selectId = savedTheme === deleteTarget.id ? "light" : undefined;
    setDeleteTarget(null);
    const ok = await persistCustoms(next, selectId);
    if (!ok) setActionError(t("settings.general.theme.custom.saveFailed"));
  }

  function exportTheme(record: CustomThemeRecord) {
    const payload = toCustomThemeExport(record);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${record.name.replace(/[^\w\-]+/g, "_") || record.id}.theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(file: File) {
    if (customs.length >= MAX_CUSTOM_THEMES) {
      setActionError(t("settings.general.theme.custom.limitReached", { n: String(MAX_CUSTOM_THEMES) }));
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseCustomThemeExport(JSON.parse(text) as unknown);
      if (!parsed) {
        setActionError(t("settings.general.theme.custom.importInvalid"));
        return;
      }
      const record: CustomThemeRecord = {
        id: parsed.theme.id,
        name: parsed.name,
        ...(parsed.basedOn ? { basedOn: parsed.basedOn } : {}),
        theme: parsed.theme,
      };
      setEditing(record);
      setActionError(null);
    } catch {
      setActionError(t("settings.general.theme.custom.importInvalid"));
    }
  }

  function renderGroup(ids: readonly BuiltinAppThemeId[], labelKey: MessageKey) {
    return (
      <div className="settings-theme-group">
        <p className="settings-theme-group-label">{t(labelKey)}</p>
        <div className="settings-theme-grid" role="listbox" aria-label={t(labelKey)}>
          {ids.map((id) => {
            if (id !== "system" && !byId.has(id)) return null;
            const selected = activeId === id;
            return (
              <ChoiceCard
                key={id}
                className="settings-theme-card"
                selected={selected}
                onSelect={() => void choose(id)}
                swatch={<ThemeSwatch id={id} customs={customs} />}
              >
                <strong>{t(THEME_LABEL[id])}</strong>
                <span>{t(THEME_DESC[id])}</span>
              </ChoiceCard>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`settings-theme${showIntro ? "" : " settings-theme-embedded"}`}>
      {showIntro ? (
        <div className="settings-theme-head">
          <strong>{t("settings.general.theme.title")}</strong>
          <span>{t("settings.general.theme.description")}</span>
        </div>
      ) : null}

      {renderGroup(APP_THEME_BASE_IDS, "settings.general.theme.baseGroup")}
      {renderGroup(APP_THEME_CREATIVE_IDS, "settings.general.theme.creativeGroup")}

      {allowCustom && onCustomThemesChange ? (
        <div className="settings-theme-group">
          <div className="settings-theme-custom-head">
            <p className="settings-theme-group-label">{t("settings.general.theme.custom.group")}</p>
            <div className="settings-theme-custom-actions">
              <Button
                variant="secondary"
                size="sm"
                disabled={customs.length >= MAX_CUSTOM_THEMES}
                onClick={createNew}
              >
                {t("settings.general.theme.custom.new")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={customs.length >= MAX_CUSTOM_THEMES}
                onClick={() => {
                  setForkSource("light");
                  setForkOpen(true);
                }}
              >
                {t("settings.general.theme.custom.newFrom")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                {t("settings.general.theme.custom.import")}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void onImportFile(file);
                }}
              />
            </div>
          </div>
          {actionError ? <p className="settings-err">{actionError}</p> : null}
          {customs.length === 0 ? (
            <p className="settings-theme-custom-empty">{t("settings.general.theme.custom.empty")}</p>
          ) : (
            <div
              className="settings-theme-grid"
              role="listbox"
              aria-label={t("settings.general.theme.custom.group")}
            >
              {customs.map((record) => {
                const selected = activeId === record.id;
                return (
                  <ChoiceCard
                    key={record.id}
                    className="settings-theme-card settings-theme-card-custom"
                    selected={selected}
                    onSelect={() => void choose(record.id)}
                    swatch={<ThemeSwatch id={record.id} customs={customs} />}
                  >
                    <strong>{record.name}</strong>
                    <span>
                      {record.basedOn
                        ? t("settings.general.theme.custom.basedOn", { id: record.basedOn })
                        : t("settings.general.theme.custom.customDesc")}
                    </span>
                    <div className="settings-theme-card-ops">
                      <button
                        type="button"
                        className="settings-theme-card-op"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(record);
                        }}
                      >
                        {t("settings.general.theme.custom.edit")}
                      </button>
                      <button
                        type="button"
                        className="settings-theme-card-op"
                        onClick={(e) => {
                          e.stopPropagation();
                          exportTheme(record);
                        }}
                      >
                        {t("settings.general.theme.custom.export")}
                      </button>
                      <button
                        type="button"
                        className="settings-theme-card-op is-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(record);
                        }}
                      >
                        {t("settings.general.theme.custom.delete")}
                      </button>
                    </div>
                  </ChoiceCard>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <Modal
        open={forkOpen}
        onClose={() => setForkOpen(false)}
        closeOnBackdrop
        closeOnEscape
        aria-labelledby="custom-theme-fork-title"
      >
        <div className="settings-theme-fork">
          <h2 id="custom-theme-fork-title">{t("settings.general.theme.custom.newFromTitle")}</h2>
          <p>{t("settings.general.theme.custom.newFromLead")}</p>
          <Select
            value={forkSource}
            options={forkOptions}
            aria-label={t("settings.general.theme.custom.newFromTitle")}
            onChange={setForkSource}
          />
          <div className="settings-theme-fork-actions">
            <Button variant="ghost" onClick={() => setForkOpen(false)}>
              {t("settings.general.theme.custom.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void createFromSource()}>
              {t("settings.general.theme.custom.create")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        closeOnBackdrop
        closeOnEscape
        aria-labelledby="custom-theme-delete-title"
      >
        <div className="settings-theme-fork">
          <h2 id="custom-theme-delete-title">{t("settings.general.theme.custom.deleteTitle")}</h2>
          <p>
            {t("settings.general.theme.custom.deleteBody", {
              name: deleteTarget?.name ?? "",
            })}
          </p>
          <div className="settings-theme-fork-actions">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("settings.general.theme.custom.cancel")}
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()}>
              {t("settings.general.theme.custom.delete")}
            </Button>
          </div>
        </div>
      </Modal>

      <CustomThemeEditor
        open={Boolean(editing)}
        record={editing}
        customsBaseline={customs}
        onClose={() => {
          setEditing(null);
          applyAppearance(savedTheme, typeStyle, customs);
        }}
        onSave={async (record) => {
          await saveEdited(record);
          setEditing(null);
        }}
      />
    </div>
  );
}
