/**
 * 通用设置共享状态：加载、跨窗同步、patch、根目录草稿与迁移。 * 各设置子页复用，避免多份 IPC 状态分叉。 */
import {
  type AttentionPreviewKind,
  type DataDirChangePreview,
  type DataDirMigrateProgress,
  DEFAULT_GENERAL_SETTINGS,
  type GeneralSettings,
  type ShellProfile,
} from "@thinker-workbench/shared";
import { useEffect, useRef, useState } from "react";
import { listShellProfiles } from "../../bridge/terminal";
import {
  applyDataDirChange,
  GENERAL_SETTINGS_CHANGED,
  getGeneralSettings,
  onDataDirMigrateProgress,
  pickDirectory,
  previewAttention,
  previewDataDirChange,
  setGeneralSettings,
} from "../../bridge/thinker";
import { useI18n } from "../../i18n/useI18n";
import { useAppearance } from "../../theme/useAppearance";

export type UseGeneralSettingsResult = {
  available: boolean;
  general: GeneralSettings;
  error: string | null;
  setError: (error: string | null) => void;
  patchGeneral: (patch: Partial<GeneralSettings>) => Promise<boolean>;
  shellProfiles: ShellProfile[];
  previewBusy: AttentionPreviewKind | null;
  tryPreview: (kind: AttentionPreviewKind) => Promise<void>;
  toggleBool: (id: BooleanToggleId) => Promise<void>;
  /** 根目录。 */
  dataDirDraft: string;
  setDataDirDraft: (value: string) => void;
  dataDirDirty: boolean;
  dataDirBusy: boolean;
  canBrowse: boolean;
  canApplyDataDir: boolean;
  migratePreview: DataDirChangePreview | null;
  setMigratePreview: (value: DataDirChangePreview | null) => void;
  migrateProgress: DataDirMigrateProgress | null;
  migrating: boolean;
  browseDataDir: () => Promise<void>;
  beginSaveDataDir: () => Promise<void>;
  confirmDataDirChange: (migrate: boolean) => Promise<void>;
};

export type BooleanToggleId =
  | "systemNotifications"
  | "systemTrayIcon"
  | "completionSound"
  | "allowAiDeleteFiles"
  | "allowAiShell"
  | "allowAiBrowser"
  | "openLocalLinksInBrowser";

/**
 * @param active 当前设置分区可见时为 true，触发从磁盘重载。 */
export function useGeneralSettings(active = true): UseGeneralSettingsResult {
  const { t, applyGeneral } = useI18n();
  const { applyAppearance } = useAppearance();
  const [general, setGeneral] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [dataDirDraft, setDataDirDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState<AttentionPreviewKind | null>(null);
  const [dataDirBusy, setDataDirBusy] = useState(false);
  const [migratePreview, setMigratePreview] = useState<DataDirChangePreview | null>(null);
  const [migrateProgress, setMigrateProgress] = useState<DataDirMigrateProgress | null>(null);
  const [shellProfiles, setShellProfiles] = useState<ShellProfile[]>([]);
  const available = Boolean(window.thinker?.settings?.getGeneral);
  const canBrowse = Boolean(window.thinker?.settings?.pickDirectory);
  const canApplyDataDir = Boolean(window.thinker?.settings?.applyDataDirChange);
  const dataDirDirty = dataDirDraft.trim() !== general.dataDir.trim();

  // 避免把 apply* 放进加载 effect 依赖：Appearance 每次 apply 都可能换引用
  const applyGeneralRef = useRef(applyGeneral);
  const applyAppearanceRef = useRef(applyAppearance);
  applyGeneralRef.current = applyGeneral;
  applyAppearanceRef.current = applyAppearance;

  useEffect(() => {
    if (!available || !active) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await getGeneralSettings();
        if (!cancelled) {
          setGeneral(next);
          setDataDirDraft(next.dataDir);
          applyGeneralRef.current(next);
          applyAppearanceRef.current(next.uiTheme, next.customThemes);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    void listShellProfiles().then((profiles) => {
      if (!cancelled) setShellProfiles(profiles);
    });
    return () => {
      cancelled = true;
    };
  }, [available, active]);

  useEffect(() => {
    function onChanged(event: Event) {
      const saved = (event as CustomEvent<GeneralSettings>).detail;
      if (!saved) return;
      setGeneral((prev) => {
        // 根目录草稿未改动时才跟随推送，避免输入过程中被清空
        setDataDirDraft((draft) => (draft.trim() === prev.dataDir.trim() ? saved.dataDir : draft));
        return saved;
      });
      applyGeneralRef.current(saved);
      applyAppearanceRef.current(saved.uiTheme, saved.customThemes);
      setError(null);
    }
    window.addEventListener(GENERAL_SETTINGS_CHANGED, onChanged);
    return () => window.removeEventListener(GENERAL_SETTINGS_CHANGED, onChanged);
  }, []);

  useEffect(() => {
    return onDataDirMigrateProgress((progress) => {
      setMigrateProgress(progress);
    });
  }, []);

  async function patchGeneral(patch: Partial<GeneralSettings>): Promise<boolean> {
    setGeneral((prev) => {
      const next = { ...prev, ...patch };
      if (patch.uiLocale) applyGeneral(next);
      return next;
    });
    try {
      const saved = await setGeneralSettings(patch);
      setGeneral(saved);
      applyGeneral(saved);
      setError(null);
      return true;
    } catch (err) {
      const next = await getGeneralSettings().catch(() => null);
      if (next) {
        setGeneral(next);
        setDataDirDraft(next.dataDir);
        applyGeneral(next);
        applyAppearance(next.uiTheme, next.customThemes);
      }
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async function browseDataDir() {
    const picked = await pickDirectory({
      title: t("settings.general.dataDir.title"),
      defaultPath: dataDirDraft.trim() || undefined,
    });
    if (!picked) return;
    setDataDirDraft(picked);
  }

  async function beginSaveDataDir() {
    if (!dataDirDirty || dataDirBusy) return;
    setDataDirBusy(true);
    setError(null);
    try {
      const preview = await previewDataDirChange(dataDirDraft);
      if (!preview.changed) {
        setDataDirDraft(general.dataDir);
        setDataDirBusy(false);
        return;
      }
      if (preview.runningSessionCount > 0) {
        setError(
          t("settings.general.dataDir.runningSessions").replace(
            "{n}",
            String(preview.runningSessionCount),
          ),
        );
        setDataDirBusy(false);
        return;
      }
      setMigratePreview(preview);
      setDataDirBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDataDirBusy(false);
    }
  }

  async function confirmDataDirChange(migrate: boolean) {
    if (!migratePreview) return;
    setDataDirBusy(true);
    setMigrateProgress({
      phase: "preparing",
      done: 0,
      total: 0,
      percent: 0,
    });
    try {
      const result = await applyDataDirChange({
        dataDir: migratePreview.configuredTo,
        migrate,
      });
      if (!result.ok) {
        const code = result.error ?? "unknown";
        if (code.startsWith("running_sessions:")) {
          setError(
            t("settings.general.dataDir.runningSessions").replace("{n}", code.split(":")[1] ?? "?"),
          );
        } else if (code === "nested_paths") {
          setError(t("settings.general.dataDir.nestedPaths"));
        } else {
          setError(code);
        }
        setMigratePreview(null);
        setMigrateProgress(null);
        setDataDirBusy(false);
        return;
      }
      if (result.general) {
        setGeneral(result.general);
        setDataDirDraft(result.general.dataDir);
        applyGeneral(result.general);
      }
      setMigratePreview(null);
      setMigrateProgress(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMigratePreview(null);
      setMigrateProgress(null);
    } finally {
      setDataDirBusy(false);
    }
  }

  async function toggleBool(id: BooleanToggleId) {
    await patchGeneral({ [id]: !general[id] });
  }

  async function tryPreview(kind: AttentionPreviewKind) {
    if (previewBusy) return;
    setPreviewBusy(kind);
    try {
      await previewAttention(kind);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewBusy(null);
    }
  }

  const migrating = Boolean(migrateProgress && migrateProgress.phase !== "done");

  return {
    available,
    general,
    error,
    setError,
    patchGeneral,
    shellProfiles,
    previewBusy,
    tryPreview,
    toggleBool,
    dataDirDraft,
    setDataDirDraft,
    dataDirDirty,
    dataDirBusy,
    canBrowse,
    canApplyDataDir,
    migratePreview,
    setMigratePreview,
    migrateProgress,
    migrating,
    browseDataDir,
    beginSaveDataDir,
    confirmDataDirChange,
  };
}
