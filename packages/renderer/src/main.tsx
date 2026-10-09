/**
 * 渲染进程入口：挂载 React 树，并在外观就绪后移除启动闪屏。
 *
 * 启动顺序：
 * 1. 同步读取 boot 外观并立刻 `applyDesignTheme`，避免首帧闪烁
 * 2. 用 ThemeProvider / AppearanceProvider / I18nProvider 包裹 `App`
 * 3. 双 rAF 后再监听 `tw-appearance-ready`，短暂停留后移除 `#boot-splash`
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyDesignTheme, disableTabFocusNav } from "@thinker-workbench/design";
import { ThemeProvider } from "@thinker-workbench/design/react";
import "@thinker-workbench/design/styles.less";
import "@thinker-workbench/design/controls.less";
import "@thinker-workbench/markdown/styles.less";
import "katex/dist/katex.min.css";
import { App } from "./App";
import { readBootAppearance } from "./boot/readBootAppearance";
import { I18nProvider } from "./i18n/I18nProvider";
import { AppearanceProvider } from "./theme/AppearanceProvider";
import "./styles.less";

// 全局禁止 Tab 切换焦点（桌面端以指针为主）
disableTabFocusNav();

/** 外观就绪后，毛玻璃闪屏再停留的毫秒数（让产品名逐字动画播完）。 */
const BOOT_HOLD_MS = 1100;
/** 淡出动画时长；结束后移除 DOM。 */
const BOOT_FADE_MS = 360;
/** 若未收到 `tw-appearance-ready`，最长等待后仍强制关闭闪屏。 */
const BOOT_APPEARANCE_FALLBACK_MS = 2000;

const boot = readBootAppearance();
applyDesignTheme(boot.theme);

/**
 * 在 AppearanceProvider 发出就绪事件（或超时）后，短暂保留闪屏再淡出移除。
 * 使用 `finished` 保证只执行一次。
 */
function dismissBootSplashWhenReady(): void {
  const el = document.getElementById("boot-splash");
  if (!el) return;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.setTimeout(() => {
      el.classList.add("is-leaving");
      const remove = () => el.remove();
      el.addEventListener("animationend", remove, { once: true });
      window.setTimeout(remove, BOOT_FADE_MS + 40);
    }, BOOT_HOLD_MS);
  };

  window.addEventListener("tw-appearance-ready", finish, { once: true });
  window.setTimeout(finish, BOOT_APPEARANCE_FALLBACK_MS);
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider theme={boot.theme}>
      <AppearanceProvider
        initialThemeId={boot.themeId}
        initialTypeStyle={boot.typeStyle}
        initialCustomThemes={boot.customThemes}
      >
        <I18nProvider>
          <App />
        </I18nProvider>
      </AppearanceProvider>
    </ThemeProvider>
  </StrictMode>,
);

// 等布局完成后再开始闪屏关闭逻辑，避免与首帧绘制抢时间
requestAnimationFrame(() => {
  requestAnimationFrame(() => dismissBootSplashWhenReady());
});
