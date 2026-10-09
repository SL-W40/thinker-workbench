/**
 * 首次运行引导闸门：当通用设置 `onboardingCompleted` 为 false 时展示 OnboardingModal。
 * 无设置 API（浏览器预览）时保持关闭。
 */
import { useEffect, useState } from "react";
import { getGeneralSettings } from "../../bridge/thinker";
import { OnboardingModal } from "./OnboardingModal";

/** 在 `general.onboardingCompleted` 为 false 时弹出首次设置对话框。 */
export function OnboardingGate() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!window.thinker?.settings?.getGeneral) return;
    let cancelled = false;
    void (async () => {
      try {
        const general = await getGeneralSettings();
        if (!cancelled && !general.onboardingCompleted) setOpen(true);
      } catch {
        /* 保持关闭 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;
  return <OnboardingModal onDone={() => setOpen(false)} />;
}
