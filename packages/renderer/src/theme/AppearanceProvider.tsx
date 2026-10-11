/**
 * 应用外观上下文：主题偏好（含跟随系统 / 自定义）。
 *
 * - 初始值来自 boot 同步绘制，避免与闪屏 / ThemeProvider 不一致
 * - 若存在 `getGeneralSync`，不再异步覆盖（曾与设置页竞态导致主题闪动）
 * - 就绪后派发 `tw-appearance-ready`，供 main.tsx 关闭闪屏
 *
 * 注意：本文件只导出组件。hooks 见 `useAppearance.ts`——同文件混导出会让
 * Vite Fast Refresh 失败并触发整页 reload，Electron 下常表现为白屏。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { resolveUiTheme } from "@thinker-workbench/design";
import { useDesignTheme } from "@thinker-workbench/design/react";
import {
  DEFAULT_APP_THEME,
  normalizeUiTheme,
  type AppThemeId,
  type CustomThemeRecord,
} from "@thinker-workbench/shared";
import { GENERAL_SETTINGS_CHANGED, getGeneralSettings } from "../bridge/thinker";
import {
  AppearanceContext,
  type AppearanceContextValue,
} from "./appearanceContext";

/** 当前 OS 是否偏好深色。 */
function readPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** 自定义主题列表是否等价（避免无意义的 setState）。 */
function sameCustomThemes(
  a: readonly CustomThemeRecord[],
  b: readonly CustomThemeRecord[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      !x ||
      !y ||
      x.id !== y.id ||
      x.name !== y.name ||
      x.basedOn !== y.basedOn ||
      JSON.stringify(x.theme) !== JSON.stringify(y.theme)
    ) {
      return false;
    }
  }
  return true;
}

/** 通知启动闪屏：外观已可展示。 */
function signalAppearanceReady() {
  window.dispatchEvent(new Event("tw-appearance-ready"));
}

type Props = {
  children: ReactNode;
  /** 来自同步 boot，使闪屏 / ThemeProvider 已与设置一致。 */
  initialThemeId?: AppThemeId;
  initialCustomThemes?: CustomThemeRecord[];
};

/**
 * 加载并暴露外观状态；供设置页、引导页、文档等实时预览主题。
 */
export function AppearanceProvider({
  children,
  initialThemeId = DEFAULT_APP_THEME,
  initialCustomThemes = [],
}: Props) {
  const { setTheme } = useDesignTheme();
  const [themeId, setThemeId] = useState<AppThemeId>(initialThemeId);
  const [customThemes, setCustomThemes] = useState<CustomThemeRecord[]>(initialCustomThemes);
  const [prefersDark, setPrefersDark] = useState(readPrefersDark);
  const booted = useRef(false);
  const themeIdRef = useRef(themeId);
  const customsRef = useRef(customThemes);
  themeIdRef.current = themeId;
  customsRef.current = customThemes;

  const applyAppearance = useCallback(
    (
      theme: AppThemeId,
      customs: readonly CustomThemeRecord[] = customsRef.current,
      dark = prefersDark,
    ) => {
      const list = [...customs];
      setThemeId(theme);
      // 内容未变则保留原引用，避免上下文 applyAppearance 包装函数身份抖动
      setCustomThemes((prev) => (sameCustomThemes(prev, list) ? prev : list));
      setTheme(resolveUiTheme(theme, list, dark));
    },
    [prefersDark, setTheme],
  );

  // 跟随系统：OS 深浅色变化时重算色板
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const dark = mq.matches;
      setPrefersDark(dark);
      if (themeIdRef.current === "system") {
        applyAppearance("system", customsRef.current, dark);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [applyAppearance]);

  // 其它窗口改了通用设置：对齐本窗外观，并派发事件给设置表单 / 语言
  useEffect(() => {
    const off = window.thinker?.settings?.onGeneralChanged?.((general) => {
      applyAppearance(general.uiTheme, general.customThemes);
      window.dispatchEvent(new CustomEvent(GENERAL_SETTINGS_CHANGED, { detail: general }));
    });
    return off;
  }, [applyAppearance]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    // 同步 boot 已画好 ThemeProvider + 闪屏——不要再异步覆盖
    if (window.thinker?.settings?.getGeneralSync) {
      signalAppearanceReady();
      return;
    }

    if (!window.thinker?.settings?.getGeneral) {
      signalAppearanceReady();
      return;
    }

    // 仅浏览器预览等无 sync API 的环境：异步拉一次并必要时对齐
    void (async () => {
      try {
        const general = await getGeneralSettings();
        const nextTheme = normalizeUiTheme(
          general.uiTheme,
          general.customThemes,
          DEFAULT_APP_THEME,
        );
        if (
          nextTheme !== themeIdRef.current ||
          general.customThemes.length !== customsRef.current.length
        ) {
          applyAppearance(nextTheme, general.customThemes);
        }
      } catch {
        /* 保持默认 */
      } finally {
        signalAppearanceReady();
      }
    })();
  }, [applyAppearance]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      themeId: normalizeUiTheme(themeId, customThemes, DEFAULT_APP_THEME),
      customThemes,
      applyAppearance,
    }),
    [themeId, customThemes, applyAppearance],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
