/**
 * 根组件树（与 main.tsx 的 createRoot 分文件）。
 *
 * 入口文件若同时含组件与 createRoot，Vite Fast Refresh 失败时会二次挂载导致 Electron 白屏。
 */

import { ThemeProvider, ToastProvider } from "@thinker-workbench/design/react";
import { type ReactNode, StrictMode, useCallback, useState } from "react";
import { ModelSecretGateProvider } from "../features/modelSecrets/ModelSecretGate";
import { AppearanceProvider } from "../platform/appearance/AppearanceProvider";
import { readBootAppearance } from "../platform/appearance/readBootAppearance";
import { I18nProvider } from "../ui/i18n/I18nProvider";
import { useT } from "../ui/i18n/useI18n";
import { App } from "./App";
import { HmrErrorBoundary } from "./HmrErrorBoundary";

const boot = readBootAppearance();

/** 开发态才包 HMR 错误边界；生产包不挂载，避免出现「恢复界面」页。 */
function DevHmrShell({ children }: { children: ReactNode }) {
  const [resetKey, setResetKey] = useState(0);
  const remount = useCallback(() => {
    window.setTimeout(() => setResetKey((k) => k + 1), 0);
  }, []);
  return (
    <HmrErrorBoundary resetKey={resetKey} onError={remount}>
      {children}
    </HmrErrorBoundary>
  );
}

/** Toast 需要 i18n 文案（关闭按钮 / 区域名），所以挂在 I18nProvider 内侧。 */
function ToastBoundary({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <ToastProvider
      dismissLabel={t("common.dismiss")}
      regionLabel={t("common.notifications")}
      placement="top-right"
    >
      {children}
    </ToastProvider>
  );
}

/** 根树：主题 / 外观 / i18n / Toast / App；开发态在 i18n 内侧加 HMR remount 兜底（文案需 locale）。 */
export function RootApp() {
  return (
    <StrictMode>
      <ThemeProvider theme={boot.theme}>
        <AppearanceProvider initialThemeId={boot.themeId} initialCustomThemes={boot.customThemes}>
          <I18nProvider>
            <ToastBoundary>
              <ModelSecretGateProvider>
                {import.meta.env.DEV ? (
                  <DevHmrShell>
                    <App />
                  </DevHmrShell>
                ) : (
                  <App />
                )}
              </ModelSecretGateProvider>
            </ToastBoundary>
          </I18nProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </StrictMode>
  );
}
