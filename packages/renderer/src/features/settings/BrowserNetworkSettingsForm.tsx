/**
 * 设置 →浏览器与网络：自动化目标、浏览器保护、本地链接、HTTP 兼容模式。 */
import { Select, Switch } from "@thinker-workbench/design/react";
import {
  HTTP_COMPATIBILITY_MODES,
  type HttpCompatibilityMode,
} from "@thinker-workbench/shared";
import { useEffect, useMemo, useState } from "react";
import { browserGetState, onBrowserEvent } from "../../bridge/browser";
import { useI18n } from "../../i18n/useI18n";
import { useGeneralSettings } from "./useGeneralSettings";

type Props = {
  active?: boolean;
};

export function BrowserNetworkSettingsForm({ active = true }: Props) {
  const { t } = useI18n();
  const { available, general, error, patchGeneral } = useGeneralSettings(active);
  const [browserConnected, setBrowserConnected] = useState(false);

  useEffect(() => {
    if (!active || !available) return;
    let cancelled = false;
    void browserGetState().then((state) => {
      if (!cancelled && state) {
        setBrowserConnected(Boolean(state.visible || (state.url && state.url !== "about:blank")));
      }
    });
    const off = onBrowserEvent((event) => {
      if (event.type !== "state") return;
      const { state } = event;
      setBrowserConnected(Boolean(state.visible || (state.url && state.url !== "about:blank")));
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [active, available]);

  const automationOptions = useMemo(
    () => [
      {
        value: "browserTab",
        label: t("settings.browser.automation.targetTab"),
      },
    ],
    [t],
  );

  const httpOptions = useMemo(
    () =>
      HTTP_COMPATIBILITY_MODES.map((mode) => ({
        value: mode,
        label:
          mode === "http1"
            ? t("settings.browser.httpCompatibility.http1")
            : t("settings.browser.httpCompatibility.http2"),
      })),
    [t],
  );

  if (!available) {
    return (
      <p className="settings-note">{t("settings.general.unavailable", { cmd: "pnpm run dev" })}</p>
    );
  }

  // 「浏览器保护」打开 = 禁止 Agent 自动跑浏览器工具 = allowAiBrowser false
  const browserProtectionOn = !general.allowAiBrowser;

  return (
    <div className="settings-general">
      <section className="settings-storage-block">
        <div className="settings-theme-head">
          <strong>{t("settings.browser.automation.title")}</strong>
          <span>
            {browserConnected
              ? t("settings.browser.automation.statusConnected")
              : t("settings.browser.automation.statusReady")}
          </span>
        </div>
        <ul className="settings-toggle-list">
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.browser.automation.targetLabel")}</strong>
              <span>{t("settings.browser.automation.targetDescription")}</span>
            </div>
            <Select
              className="settings-locale-select"
              value="browserTab"
              options={automationOptions}
              aria-label={t("settings.browser.automation.targetLabel")}
              onChange={() => undefined}
            />
          </li>
        </ul>
      </section>

      <ul className="settings-toggle-list">
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.browser.protection.title")}</strong>
            <span>{t("settings.browser.protection.description")}</span>
          </div>
          <Switch
            checked={browserProtectionOn}
            aria-label={t("settings.browser.protection.title")}
            onChange={(on) => void patchGeneral({ allowAiBrowser: !on })}
          />
        </li>
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.browser.openLocalLinks.title")}</strong>
            <span>{t("settings.browser.openLocalLinks.description")}</span>
          </div>
          <Switch
            checked={general.openLocalLinksInBrowser}
            aria-label={t("settings.browser.openLocalLinks.title")}
            onChange={(openLocalLinksInBrowser) => void patchGeneral({ openLocalLinksInBrowser })}
          />
        </li>
      </ul>

      <section className="settings-storage-block">
        <div className="settings-theme-head">
          <strong>{t("settings.browser.network.title")}</strong>
          <span>{t("settings.browser.network.description")}</span>
        </div>
        <ul className="settings-toggle-list">
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.browser.httpCompatibility.title")}</strong>
              <span>{t("settings.browser.httpCompatibility.description")}</span>
            </div>
            <Select
              className="settings-locale-select"
              value={general.httpCompatibilityMode}
              options={httpOptions}
              aria-label={t("settings.browser.httpCompatibility.title")}
              onChange={(value) =>
                void patchGeneral({
                  httpCompatibilityMode: value as HttpCompatibilityMode,
                })
              }
            />
          </li>
        </ul>
      </section>

      {error ? <p className="settings-err">{error}</p> : null}
    </div>
  );
}
