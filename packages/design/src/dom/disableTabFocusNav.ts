/**
 * 全局禁止 Tab / Shift+Tab 在可聚焦控件间切换焦点。
 * 桌面端以指针操作为主；仍允许鼠标点击聚焦，不影响快捷键录制等对 Tab 键本身的监听。
 */

let installed = false;

/** 在 capture 阶段拦截 Tab，阻止浏览器默认焦点环切换。幂等。 */
export function disableTabFocusNav(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
    },
    true,
  );
}
