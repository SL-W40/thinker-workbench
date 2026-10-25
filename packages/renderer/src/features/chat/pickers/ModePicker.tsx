/**
 * Composer 左下角 ChatMode：紧凑触发器 + 带图标与说明的上浮面板。
 */

import {
  AgentModeIcon,
  AskModeIcon,
  DebugModeIcon,
  type IconProps,
  MultitaskModeIcon,
  PlanModeIcon,
} from "@thinker-workbench/design/react";
import {
  CHAT_MODES,
  type ChatMode,
  DEFAULT_CHAT_MODE,
  normalizeChatMode,
} from "@thinker-workbench/shared";
import { type ComponentType, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getSessionChatMode,
  onSessionChatModeChanged,
  setSessionChatMode,
} from "../../../platform/ipc/thinker";
import type { MessageKey } from "../../../ui/i18n/translate";
import { useT } from "../../../ui/i18n/useI18n";
import { MODE_LABEL_KEY } from "./modeLabels";
import "./ModePicker.less";

type Props = {
  sessionId?: string | null;
  disabled?: boolean;
};

type MenuCoords = { left: number; bottom: number; width: number };

const LABEL_KEY: Record<ChatMode, MessageKey> = MODE_LABEL_KEY;

const DESC_KEY: Record<ChatMode, MessageKey> = {
  agent: "chat.mode.agentDesc",
  plan: "chat.mode.planDesc",
  debug: "chat.mode.debugDesc",
  ask: "chat.mode.askDesc",
  multitask: "chat.mode.multitaskDesc",
};

const MODE_ICON: Record<ChatMode, ComponentType<IconProps>> = {
  agent: AgentModeIcon,
  plan: PlanModeIcon,
  debug: DebugModeIcon,
  ask: AskModeIcon,
  multitask: MultitaskModeIcon,
};

const MENU_MIN = 280;
const MENU_MAX = 340;

export function ModePicker({ sessionId, disabled }: Props) {
  const t = useT();
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ChatMode>(DEFAULT_CHAT_MODE);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!sessionId) {
        setMode(DEFAULT_CHAT_MODE);
        return;
      }
      try {
        const stored = await getSessionChatMode(sessionId);
        if (!cancelled) setMode(stored ? normalizeChatMode(stored) : DEFAULT_CHAT_MODE);
      } catch {
        if (!cancelled) setMode(DEFAULT_CHAT_MODE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 工具请求切换 / 其它窗口改动：跟着广播刷新，别停在旧模式
  useEffect(() => {
    if (!sessionId) return;
    return onSessionChatModeChanged((change) => {
      if (change.sessionId !== sessionId) return;
      setMode(normalizeChatMode(change.chatMode));
    });
  }, [sessionId]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null);
      return;
    }
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 6;
      const pad = 8;
      const width = Math.min(MENU_MAX, Math.max(MENU_MIN, r.width * 2.4));
      let left = r.left;
      if (left + width > vw - pad) left = Math.max(pad, vw - width - pad);
      setCoords({
        left,
        bottom: vh - r.top + gap,
        width,
      });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  function apply(next: ChatMode) {
    setMode(next);
    setOpen(false);
    if (!sessionId) return;
    void setSessionChatMode(sessionId, next).catch(() => {
      /* ignore */
    });
  }

  // 无 session 时仍可切换本地展示；有 session 再持久化
  const blocked = Boolean(disabled);
  const TriggerIcon = MODE_ICON[mode];

  return (
    <div className={`composer-mode-picker${open ? " is-open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="composer-mode-picker__trigger"
        disabled={blocked}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t("chat.mode.label")}
        title={t(DESC_KEY[mode])}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <TriggerIcon size="sm" className="composer-mode-picker__icon" aria-hidden />
        <span className="composer-mode-picker__label">{t(LABEL_KEY[mode])}</span>
        <svg
          className="composer-mode-picker__chevron"
          viewBox="0 0 12 12"
          width={10}
          height={10}
          aria-hidden
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              className="composer-mode-menu"
              role="listbox"
              aria-label={t("chat.mode.label")}
              style={{
                left: coords.left,
                bottom: coords.bottom,
                width: coords.width,
              }}
            >
              <div className="composer-mode-menu__list">
                {CHAT_MODES.map((id) => {
                  const selected = id === mode;
                  const ItemIcon = MODE_ICON[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`composer-mode-menu__item${selected ? " is-selected" : ""}`}
                      onClick={() => apply(id)}
                    >
                      <ItemIcon size="sm" className="composer-mode-menu__icon" aria-hidden />
                      <span className="composer-mode-menu__name">{t(LABEL_KEY[id])}</span>
                      {selected ? (
                        <span className="composer-mode-menu__check" aria-hidden>
                          ✓
                        </span>
                      ) : (
                        <span className="composer-mode-menu__check-slot" aria-hidden />
                      )}
                      <p className="composer-mode-menu__desc" title={t(DESC_KEY[id])}>
                        {t(DESC_KEY[id])}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
