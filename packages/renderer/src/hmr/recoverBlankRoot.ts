/**
 * Electron + Vite：Fast Refresh 失败时偶发只清空 #root 却未完成整页 reload。
 * 在 HMR 更新后检测空根并强制 location.reload（与手动 Ctrl+R 等效）。
 */
export function installBlankRootRecovery(): void {
  const hot = import.meta.hot;
  if (!hot) return;

  let scheduled = false;
  const check = () => {
    scheduled = false;
    const el = document.getElementById("root");
    if (!el || el.childElementCount > 0) return;
    console.warn("[hmr] #root empty after update; reloading");
    location.reload();
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    // 双 rAF：等 React 提交后再判断是否真的空了
    requestAnimationFrame(() => {
      requestAnimationFrame(check);
    });
  };

  hot.on("vite:afterUpdate", schedule);
}
