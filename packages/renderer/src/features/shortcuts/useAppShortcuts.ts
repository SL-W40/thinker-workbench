/**
 * 渲染进程全局快捷键：加载映射、监听 keydown，并调用各 ShortcutId 处理器。
 * `reload` 由主进程 before-input-event 处理，此处跳过。
 */
import {
  MAIN_PROCESS_SHORTCUTS,
  SHORTCUT_CATALOG,
  getDefaultShortcuts,
  matchAccelerator,
  type ShortcutId,
  type ShortcutsMap,
} from "@thinker-workbench/shared";
import { useEffect, useRef, useState } from "react";
import {
  SHORTCUTS_SETTINGS_CHANGED,
  getShortcutsSettings,
} from "../../bridge/thinker";
import { isShortcutRecording } from "./recordingGate";

/** 返回 `false` 表示未处理（勿 preventDefault），便于 Escape 在空闲时放行。 */
export type ShortcutHandlers = Partial<Record<ShortcutId, () => void | boolean>>;

/** 是否存在应优先响应 Escape 的对话框（避免抢走 Modal 关闭）。 */
function hasEscapeDialog(): boolean {
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
}

/**
 * 注册应用级快捷键。
 * @param handlers 各动作回调；用 ref 持有，避免每帧重绑监听
 * @param enabled 为 false 时不监听（如辅助窗 / 工具嵌入）
 */
export function useAppShortcuts(handlers: ShortcutHandlers, enabled = true): void {
  const [map, setMap] = useState<ShortcutsMap>(() => getDefaultShortcuts());
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // 加载映射，并在设置页保存后同步
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await getShortcutsSettings();
        if (!cancelled) setMap(next);
      } catch {
        /* 浏览器预览无 preload 时保留默认 */
      }
    })();
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<ShortcutsMap>).detail;
      if (detail) setMap(detail);
    };
    window.addEventListener(SHORTCUTS_SETTINGS_CHANGED, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(SHORTCUTS_SETTINGS_CHANGED, onChanged);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // 设置页正在录制时完全放行给录制器
      if (isShortcutRecording()) return;
      if (event.defaultPrevented || event.isComposing) return;

      const input = {
        type: "keyDown" as const,
        key: event.key,
        code: event.code,
        control: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        shift: event.shiftKey,
      };

      for (const item of SHORTCUT_CATALOG) {
        if (MAIN_PROCESS_SHORTCUTS.has(item.id)) continue;
        const accel = map[item.id];
        if (!accel || !matchAccelerator(input, accel)) continue;

        // Escape：有模态对话框时让 Dialog 先处理
        if (event.key === "Escape" && hasEscapeDialog()) return;

        const handler = handlersRef.current[item.id];
        if (!handler) return;

        const handled = handler();
        if (handled === false) return;
        event.preventDefault();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, map]);
}
