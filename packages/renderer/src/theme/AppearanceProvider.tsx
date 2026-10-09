/**
 * 应用外观上下文：主题偏好（含跟随系统 / 自定义）+ 字型风格（regular/hand）。
 *
 * - 初始值来自 boot 同步绘制，避免与闪屏 / ThemeProvider 不一致
 * - 若存在 `getGeneralSync`，不再异步覆盖（曾与设置页竞态导致字型「像坏了」）
 * - 就绪后派发 `tw-appearance-ready`，供 main.tsx 关闭闪屏
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { applyTypeStyle, resolveUiTheme } from "@thinker-workbench/design";
import { useDesignTheme } from "@thinker-workbench/design/react";
import {
  DEFAULT_APP_THEME,
  DEFAULT_APP_TYPE_STYLE,
  normalizeUiTheme,
  type AppThemeId,
  type AppTypeStyle,
  type CustomThemeRecord,
} from "@thinker-workbench/shared";
import { GENERAL_SETTINGS_CHANGED, getGeneralSettings } from "../bridge/thinker";

type AppearanceContextValue = {
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

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/** 当前 OS 是否偏好深色。 */
function readPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** 通知启动闪屏：外观已可展示。 */
function signalAppearanceReady() {
  window.dispatchEvent(new Event("tw-appearance-ready"));
}

type Props = {
  children: ReactNode;
  /** 来自同步 boot，使闪屏 / ThemeProvider 已与设置一致。 */
  initialThemeId?: AppThemeId;
  initialTypeStyle?: AppTypeStyle;
  initialCustomThemes?: CustomThemeRecord[];
};

/**
 * 加载并暴露外观状态；供设置页、引导页、文档等实时预览主题。
 */
export function AppearanceProvider({
  children,
  initialThemeId = DEFAULT_APP_THEME,
  initialTypeStyle = DEFAULT_APP_TYPE_STYLE,
  initialCustomThemes = [],
}: Props) {
  const { setTheme } = useDesignTheme();
  const [themeId, setThemeId] = useState<AppThemeId>(initialThemeId);
  const [typeStyle, setTypeStyle] = useState<AppTypeStyle>(initialTypeStyle);
  const [customThemes, setCustomThemes] = useState<CustomThemeRecord[]>(initialCustomThemes);
  const [prefersDark, setPrefersDark] = useState(readPrefersDark);
  const booted = useRef(false);
  const themeIdRef = useRef(themeId);
  const typeStyleRef = useRef(typeStyle);
  const customsRef = useRef(customThemes);
  themeIdRef.current = themeId;
  typeStyleRef.current = typeStyle;
  customsRef.current = customThemes;

  const applyAppearance = useCallback(
    (
      theme: AppThemeId,
      style: AppTypeStyle,
      customs: readonly CustomThemeRecord[] = customsRef.current,
      dark = prefersDark,
    ) => {
      const list = [...customs];
      setThemeId(theme);
      setTypeStyle(style);
      setCustomThemes(list);
      document.documentElement.dataset.twType = style;
      const visual = resolveUiTheme(theme, list, dark);
      setTheme(applyTypeStyle(visual, style));
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
        applyAppearance("system", typeStyleRef.current, customsRef.current, dark);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [applyAppearance]);

  // 其它窗口改了通用设置：对齐本窗外观，并派发事件给设置表单 / 语言
  useEffect(() => {
    const off = window.thinker?.settings?.onGeneralChanged?.((general) => {
      applyAppearance(general.uiTheme, general.uiTypeStyle, general.customThemes);
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
        const nextStyle = general.uiTypeStyle ?? DEFAULT_APP_TYPE_STYLE;
        if (
          nextTheme !== themeIdRef.current ||
          nextStyle !== typeStyleRef.current ||
          general.customThemes.length !== customsRef.current.length
        ) {
          applyAppearance(nextTheme, nextStyle, general.customThemes);
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
      typeStyle,
      customThemes,
      applyAppearance: (theme, style, customs) => applyAppearance(theme, style, customs),
    }),
    [themeId, typeStyle, customThemes, applyAppearance],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

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
