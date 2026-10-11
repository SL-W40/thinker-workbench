/**
 * 外观 hooks：与 AppearanceProvider 分文件，保证 Vite Fast Refresh 兼容。
 */
import { useContext } from "react";
import {
  DEFAULT_APP_THEME,
  DEFAULT_APP_TYPE_STYLE,
} from "@thinker-workbench/shared";
import {
  AppearanceContext,
  type AppearanceContextValue,
} from "./appearanceContext";

/**
 * 读取外观上下文；若在 Provider 外使用则返回安全默认值（no-op apply）。
 */
export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    return {
      themeId: DEFAULT_APP_THEME,
      typeStyle: DEFAULT_APP_TYPE_STYLE,
      customThemes: [],
      applyAppearance: () => undefined,
    };
  }
  return ctx;
}
