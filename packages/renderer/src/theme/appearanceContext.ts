/**
 * 外观 React Context（与 Provider / hooks 分文件，避免 Fast Refresh 整页重载白屏）。
 */
import { createContext } from "react";
import type { AppThemeId, CustomThemeRecord } from "@thinker-workbench/shared";

export type AppearanceContextValue = {
  /** 用户偏好主题 id（可为 `system` 或 `custom_*`）。 */
  themeId: AppThemeId;
  /** 当前自定义主题目录（与 general 同步）。 */
  customThemes: CustomThemeRecord[];
  /** 将颜色主题应用到 ThemeProvider（含 Mermaid 等 token）。 */
  applyAppearance: (
    theme: AppThemeId,
    customs?: readonly CustomThemeRecord[],
    prefersDark?: boolean,
  ) => void;
};

export const AppearanceContext = createContext<AppearanceContextValue | null>(null);
