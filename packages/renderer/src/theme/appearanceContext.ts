/**
 * 外观 React Context（与 Provider / hooks 分文件，避免 Fast Refresh 整页重载白屏）。
 */
import { createContext } from "react";
import type {
  AppThemeId,
  AppTypeStyle,
  CustomThemeRecord,
} from "@thinker-workbench/shared";

export type AppearanceContextValue = {
  /** 用户偏好主题 id（可为 `system` 或 `custom_*`）。 */
  themeId: AppThemeId;
  typeStyle: AppTypeStyle;
  /** 当前自定义主题目录（与 general 同步）。 */
  customThemes: CustomThemeRecord[];
  /** 将颜色主题与字型一并应用到 ThemeProvider（含字体 / Mermaid）。 */
  applyAppearance: (
    theme: AppThemeId,
    typeStyle: AppTypeStyle,
    customs?: readonly CustomThemeRecord[],
  ) => void;
};

export const AppearanceContext = createContext<AppearanceContextValue | null>(null);
