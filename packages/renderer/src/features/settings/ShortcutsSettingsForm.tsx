/**
 * 设置 → 快捷键：按分组展示可编辑加速键，点击后进入录制模式（捕获 keydown）。
 * 录制中拦截全局快捷键（含主进程 reload）；保存前做冲突检测。
 * Escape 取消录制（「停止运行」除外，可录 Escape）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Callout, Kbd } from "@thinker-workbench/design/react";
import {
  SHORTCUT_CATALOG,
  SHORTCUT_GROUPS,
  acceleratorFromKeyboardEvent,
  findShortcutConflict,
  formatAcceleratorLabel,
  getDefaultShortcuts,
  normalizeAccelerator,
  type ShortcutGroup,
  type ShortcutId,
  type ShortcutsMap,
} from "@thinker-workbench/shared";
import { getShortcutsSettings, setShortcutsSettings } from "../../bridge/thinker";
import { useT } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/translate";
import { setShortcutRecording } from "../shortcuts/recordingGate";

type Props = {
  title: string;
  description: string;
};

/** 各 ShortcutId 对应的标题/描述文案键。 */
const SHORTCUT_COPY: Record<ShortcutId, { titleKey: MessageKey; descriptionKey: MessageKey }> = {
  reload: {
    titleKey: "settings.shortcuts.reloadTitle",
    descriptionKey: "settings.shortcuts.reloadDescription",
  },
  openConsole: {
    titleKey: "settings.shortcuts.openConsoleTitle",
    descriptionKey: "settings.shortcuts.openConsoleDescription",
  },
  goChat: {
    titleKey: "settings.shortcuts.goChatTitle",
    descriptionKey: "settings.shortcuts.goChatDescription",
  },
  newChat: {
    titleKey: "settings.shortcuts.newChatTitle",
    descriptionKey: "settings.shortcuts.newChatDescription",
  },
  focusComposer: {
    titleKey: "settings.shortcuts.focusComposerTitle",
    descriptionKey: "settings.shortcuts.focusComposerDescription",
  },
  stopRun: {
    titleKey: "settings.shortcuts.stopRunTitle",
    descriptionKey: "settings.shortcuts.stopRunDescription",
  },
  toggleLeftPanel: {
    titleKey: "settings.shortcuts.toggleLeftPanelTitle",
    descriptionKey: "settings.shortcuts.toggleLeftPanelDescription",
  },
  toggleRightPanel: {
    titleKey: "settings.shortcuts.toggleRightPanelTitle",
    descriptionKey: "settings.shortcuts.toggleRightPanelDescription",
  },
  navBack: {
    titleKey: "settings.shortcuts.navBackTitle",
    descriptionKey: "settings.shortcuts.navBackDescription",
  },
  navForward: {
    titleKey: "settings.shortcuts.navForwardTitle",
    descriptionKey: "settings.shortcuts.navForwardDescription",
  },
};

/** 分组标题文案键。 */
const GROUP_TITLE: Record<ShortcutGroup, MessageKey> = {
  window: "settings.shortcuts.groups.window",
  chat: "settings.shortcuts.groups.chat",
  panels: "settings.shortcuts.groups.panels",
  navigation: "settings.shortcuts.groups.navigation",
};

export function ShortcutsSettingsForm({ title, description }: Props) {
  const t = useT();
  const defaults = useMemo(() => getDefaultShortcuts(), []);
  const [shortcuts, setShortcuts] = useState<ShortcutsMap>(defaults);
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const available = Boolean(window.thinker?.settings?.getShortcuts);

  // 录制监听只用 ref，避免 shortcuts/t 变化时拆掉 keydown 监听导致「录不上」
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const tRef = useRef(t);
  tRef.current = t;

  const grouped = useMemo(() => {
    return SHORTCUT_GROUPS.map((group) => ({
      group,
      items: SHORTCUT_CATALOG.filter((item) => item.group === group),
    })).filter((g) => g.items.length > 0);
  }, []);

  // 加载已保存映射
  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await getShortcutsSettings();
        if (!cancelled) setShortcuts(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [available]);

  // 录制中：捕获阶段拦截按键；依赖仅 `recording`，监听稳定
  useEffect(() => {
    if (!recording) return;
    setShortcutRecording(true);
    // 离开按钮焦点，避免 Space/Enter 再次点到 Kbd
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const block = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const id = recording;
      // Escape：录制「停止运行」时写入 Escape；其它动作则取消录制
      if (event.key === "Escape" && id !== "stopRun") {
        setRecording(null);
        return;
      }
      const accel = acceleratorFromKeyboardEvent(event);
      if (!accel) return;

      const normalized = normalizeAccelerator(accel);
      const conflict = findShortcutConflict(id, normalized, shortcutsRef.current);
      if (conflict) {
        setMessage(null);
        setError(
          tRef.current("settings.shortcuts.duplicate", {
            action: tRef.current(SHORTCUT_COPY[conflict].titleKey),
            key: formatAcceleratorLabel(normalized),
          }),
        );
        return;
      }

      setRecording(null);
      void (async () => {
        try {
          const next = await setShortcutsSettings({ [id]: normalized });
          setShortcuts(next);
          setMessage(tRef.current("settings.shortcuts.saved"));
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", block, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", block, true);
      setShortcutRecording(false);
    };
  }, [recording]);

  /** 恢复当前平台的目录默认快捷键。 */
  async function resetDefaults() {
    try {
      const next = await setShortcutsSettings({ ...getDefaultShortcuts() });
      setShortcuts(next);
      setMessage(t("settings.shortcuts.resetOk"));
      setError(null);
      setRecording(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="settings-shortcuts">
      <header className="settings-header settings-header-row">
        <div className="settings-header-copy">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {available ? (
          <Button variant="primary" onClick={() => void resetDefaults()}>
            {t("settings.shortcuts.reset")}
          </Button>
        ) : null}
      </header>
      {!available ? (
        <Callout tone="warning">
          {t("settings.shortcuts.unavailable", {
            cmd: "pnpm run dev",
            key: formatAcceleratorLabel("Mod+R"),
          })}
        </Callout>
      ) : (
        <>
          {grouped.map(({ group, items }) => (
            <section key={group} className="settings-shortcut-group">
              <h2 className="settings-shortcut-group-title">{t(GROUP_TITLE[group])}</h2>
              <ul className="settings-shortcut-list">
                {items.map((item) => {
                  const copy = SHORTCUT_COPY[item.id];
                  const isRecording = recording === item.id;
                  return (
                    <li key={item.id} className="settings-shortcut-row">
                      <div className="settings-shortcut-copy">
                        <strong>{t(copy.titleKey)}</strong>
                        <span>{t(copy.descriptionKey)}</span>
                      </div>
                      <Kbd
                        className="settings-shortcut-key"
                        recording={isRecording}
                        aria-label={
                          isRecording
                            ? t("settings.shortcuts.pressKeys")
                            : t(copy.titleKey)
                        }
                        onClick={() => {
                          setMessage(null);
                          setError(null);
                          setRecording((prev) => (prev === item.id ? null : item.id));
                        }}
                      >
                        {isRecording
                          ? t("settings.shortcuts.pressKeys")
                          : formatAcceleratorLabel(shortcuts[item.id] || defaults[item.id])}
                      </Kbd>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="settings-form-actions">
            {message ? <p className="settings-ok">{message}</p> : null}
            {error ? <p className="settings-err">{error}</p> : null}
            {recording ? (
              <p className="settings-note">{t("settings.shortcuts.recordingHint")}</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
