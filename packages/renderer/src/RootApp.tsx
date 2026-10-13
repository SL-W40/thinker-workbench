/**
 * 根组件树（与 main.tsx 的 createRoot 分文件）。
 *
 * 入口文件若同时含组件与 createRoot，Vite Fast Refresh 失败时会二次挂载导致 Electron 白屏。
 */

import { ThemeProvider } from "@thinker-workbench/design/react";
import { type ReactNode, StrictMode, useCallback, useState } from "react";
import { App } from "./App";
import { readBootAppearance } from "./boot/readBootAppearance";
import { ModelSecretGateProvider } from "./features/modelSecrets/ModelSecretGate";
import { HmrErrorBoundary } from "./hmr/HmrErrorBoundary";
import { I18nProvider } from "./i18n/I18nProvider";
import { AppearanceProvider } from "./theme/AppearanceProvider";

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

/** 根树：主题 / 外观 / i18n / App；开发态在 i18n 内侧加 HMR remount 兜底（文案需 locale）。 */
export function RootApp() {
  return (
    <StrictMode>
      <ThemeProvider theme={boot.theme}>
        <AppearanceProvider initialThemeId={boot.themeId} initialCustomThemes={boot.customThemes}>
          <I18nProvider>
            <ModelSecretGateProvider>
              {import.meta.env.DEV ? (
                <DevHmrShell>
                  <App />
                </DevHmrShell>
              ) : (
                <App />
              )}
            </ModelSecretGateProvider>
          </I18nProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </StrictMode>
  );
}
