/**
 * 设置 →通知：系统通知、托盘、完成音。 */
import { Button, Switch } from "@thinker-workbench/design/react";
import type { AttentionPreviewKind } from "@thinker-workbench/shared";
import type { MessageKey } from "../../i18n/translate";
import { useI18n } from "../../i18n/useI18n";
import { type BooleanToggleId, useGeneralSettings } from "./useGeneralSettings";

type Props = {
  active?: boolean;
};

const TOGGLES: Array<{
  id: Extract<BooleanToggleId, "systemNotifications" | "systemTrayIcon" | "completionSound">;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  preview?: AttentionPreviewKind;
}> = [
  {
    id: "systemNotifications",
    titleKey: "settings.general.systemNotifications.title",
    descriptionKey: "settings.general.systemNotifications.description",
    preview: "notification",
  },
  {
    id: "systemTrayIcon",
    titleKey: "settings.general.systemTrayIcon.title",
    descriptionKey: "settings.general.systemTrayIcon.description",
  },
  {
    id: "completionSound",
    titleKey: "settings.general.completionSound.title",
    descriptionKey: "settings.general.completionSound.description",
    preview: "sound",
  },
];

export function NotificationsSettingsForm({ active = true }: Props) {
  const { t } = useI18n();
  const { available, general, error, previewBusy, tryPreview, toggleBool } =
    useGeneralSettings(active);

  if (!available) {
    return (
      <p className="settings-note">{t("settings.general.unavailable", { cmd: "pnpm run dev" })}</p>
    );
  }

  return (
    <div className="settings-general">
      <ul className="settings-toggle-list">
        {TOGGLES.map((item) => {
          const on = general[item.id];
          return (
            <li key={item.id} className="settings-toggle-row">
              <div className="settings-toggle-copy">
                <div className="settings-toggle-title">
                  <strong>{t(item.titleKey)}</strong>
                  {item.preview ? (
                    <Button
                      size="sm"
                      variant="text"
                      disabled={previewBusy === item.preview}
                      onClick={() => {
                        if (item.preview) void tryPreview(item.preview);
                      }}
                    >
                      {previewBusy === item.preview
                        ? t("settings.general.playing")
                        : t("settings.general.tryIt")}
                    </Button>
                  ) : null}
                </div>
                <span>{t(item.descriptionKey)}</span>
              </div>
              <Switch
                checked={on}
                aria-label={t(item.titleKey)}
                onChange={() => void toggleBool(item.id)}
              />
            </li>
          );
        })}
      </ul>
      {error ? <p className="settings-err">{error}</p> : null}
    </div>
  );
}
