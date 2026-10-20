/**
 * xterm 宿主生命周期：实例创建 / 主题同步 / 可见时补 fit / 按帧合并写入。
 */
import type { TerminalSession } from "@thinker-workbench/shared";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import { resizeTerminal, writeTerminal } from "../../../bridge/terminal";
import { applyTerminalHostColors, readXtermTheme } from "../xtermTheme";

type Theme = Parameters<typeof readXtermTheme>[0];

export type TerminalHost = {
  hostRef: RefObject<HTMLDivElement | null>;
  termRef: RefObject<Terminal | null>;
  fitRef: RefObject<FitAddon | null>;
  /** 当前会话 id（供异步回调读取最新值）。 */
  activeIdRef: RefObject<string | null>;
  sessionsRef: RefObject<TerminalSession[]>;
  /** 丢弃未刷写（切换会话时缓冲已在 buffersRef）。 */
  clearPendingWrite: () => void;
  /** 将待写 chunk 在下一帧一次写入 xterm。 */
  scheduleTermWrite: (sessionId: string, chunk: string) => void;
};

export function useTerminalHost(theme: Theme, active: boolean): TerminalHost {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<TerminalSession[]>([]);
  /** 按帧合并写入 xterm，避免高频 chunk 连刷。 */
  const pendingWriteRef = useRef("");
  const pendingWriteSessionRef = useRef<string | null>(null);
  const writeRafRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingWrite = useCallback(() => {
    if (writeRafRef.current != null) {
      window.cancelAnimationFrame(writeRafRef.current);
      writeRafRef.current = null;
    }
    pendingWriteRef.current = "";
    pendingWriteSessionRef.current = null;
  }, []);

  const scheduleTermWrite = useCallback(
    (sessionId: string, chunk: string) => {
      if (!chunk) return;
      if (pendingWriteSessionRef.current && pendingWriteSessionRef.current !== sessionId) {
        clearPendingWrite();
      }
      pendingWriteSessionRef.current = sessionId;
      pendingWriteRef.current += chunk;
      if (writeRafRef.current != null) return;
      writeRafRef.current = window.requestAnimationFrame(() => {
        writeRafRef.current = null;
        const data = pendingWriteRef.current;
        const sid = pendingWriteSessionRef.current;
        pendingWriteRef.current = "";
        pendingWriteSessionRef.current = null;
        if (data && sid && activeIdRef.current === sid) {
          termRef.current?.write(data);
        }
      });
    },
    [clearPendingWrite],
  );

  // 初始化 xterm
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      theme: readXtermTheme(theme),
      allowTransparency: false,
      // xterm 6 自绘滚动条宽度（默认 14）；略宽于全局 7px，避免胶囊边再削后过窄
      overviewRuler: { width: 10 },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    applyTerminalHostColors(host, theme);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const disposable = term.onData((data) => {
      const id = activeIdRef.current;
      if (!id || id.startsWith("preview:")) return;
      const meta = sessionsRef.current.find((s) => s.sessionId === id);
      // 已退出的会话不再写入；运行中可交互（含 Ctrl+C）
      if (meta && meta.status !== "running" && meta.status !== "starting") return;
      void writeTerminal(id, data);
    });

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            // 拖拽面板时合并 resize，避免连发 PTY resize IPC
            if (resizeTimerRef.current != null) clearTimeout(resizeTimerRef.current);
            resizeTimerRef.current = setTimeout(() => {
              resizeTimerRef.current = null;
              try {
                fit.fit();
                const dims = { cols: term.cols, rows: term.rows };
                const id = activeIdRef.current;
                if (id && !id.startsWith("preview:")) {
                  void resizeTerminal(id, dims.cols, dims.rows);
                }
              } catch {
                /* 未挂载时忽略 */
              }
            }, 50);
          })
        : null;
    ro?.observe(host);

    return () => {
      disposable.dispose();
      ro?.disconnect();
      if (resizeTimerRef.current != null) clearTimeout(resizeTimerRef.current);
      clearPendingWrite();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // 仅挂载一次；主题变更由下方 effect 同步
  }, [theme, clearPendingWrite]);

  // 外观变更时同步 xterm + 宿主底色
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const next = readXtermTheme(theme);
    term.options.theme = next;
    applyTerminalHostColors(hostRef.current, theme);
    term.refresh(0, Math.max(0, term.rows - 1));
  }, [theme]);

  // 可见时补 fit
  useEffect(() => {
    if (!active) return;
    const fit = fitRef.current;
    const term = termRef.current;
    if (!fit || !term) return;
    requestAnimationFrame(() => {
      try {
        fit.fit();
        const id = activeIdRef.current;
        if (id) void resizeTerminal(id, term.cols, term.rows);
      } catch {
        /* ignore */
      }
    });
  }, [active]);

  return {
    hostRef,
    termRef,
    fitRef,
    activeIdRef,
    sessionsRef,
    clearPendingWrite,
    scheduleTermWrite,
  };
}
