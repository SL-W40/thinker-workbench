/**
 * Composer 左下角模型选用：紧凑触发器 + 按凭证分组的富面板。 */

import { Badge } from "@thinker-workbench/design/react";
import type {
  ModelCatalogPublic,
  ModelEntry,
  ModelSelection,
  ModelTag,
} from "@thinker-workbench/shared";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getModelSettings,
  getSessionModelSelection,
  MODEL_SETTINGS_CHANGED,
  setModelSettings,
  setSessionModelSelection,
} from "../../bridge/thinker";
import type { MessageKey } from "../../i18n/translate";
import { useT } from "../../i18n/useI18n";
import "./ModelPicker.less";

type Props = {
  sessionId?: string | null;
  disabled?: boolean;
};

type MenuCoords = { left: number; bottom: number; width: number; maxHeight: number };

const TAG_KEY: Record<ModelTag, MessageKey> = {
  general: "settings.model.tag.general",
  coding: "settings.model.tag.coding",
  reasoning: "settings.model.tag.reasoning",
  fast: "settings.model.tag.fast",
  vision: "settings.model.tag.vision",
};

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

function displayName(entry: ModelEntry): string {
  return entry.label.trim() || entry.model.trim() || entry.id;
}

export function ModelPicker({ sessionId, disabled }: Props) {
  const t = useT();
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [catalog, setCatalog] = useState<ModelCatalogPublic | null>(null);
  const [selection, setSelection] = useState<ModelSelection>({ mode: "auto" });
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cat = await getModelSettings();
        if (cancelled) return;
        setCatalog(cat);
        // 无会话覆盖时用全局；全局缺省为 Auto
        let sel: ModelSelection = cat.selection ?? { mode: "auto" };
        if (sessionId) {
          const override = await getSessionModelSelection(sessionId);
          if (cancelled) return;
          if (override) sel = override;
        }
        setSelection(sel);
      } catch {
        setCatalog(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 设置页改目录后选择器仍挂着，靠事件刷新列表与展示名
  useEffect(() => {
    function onChanged(event: Event) {
      const detail = (event as CustomEvent<ModelCatalogPublic>).detail;
      if (!detail || !Array.isArray(detail.models)) return;
      setCatalog(detail);
      // 无会话覆盖时选用跟全局走；有覆盖则只换目录
      if (!sessionId) setSelection(detail.selection ?? { mode: "auto" });
    }
    window.addEventListener(MODEL_SETTINGS_CHANGED, onChanged);
    return () => window.removeEventListener(MODEL_SETTINGS_CHANGED, onChanged);
  }, [sessionId]);

  const triggerLabel = useMemo(() => {
    if (selection.mode === "auto") return t("chat.modelPicker.auto");
    const entry = catalog?.models.find((m) => m.id === selection.modelId);
    if (!entry) return t("chat.modelPicker.label");
    return truncate(displayName(entry), 18);
  }, [catalog, selection, t]);

  const triggerTitle = useMemo(() => {
    if (selection.mode === "auto") return t("chat.modelPicker.autoHint");
    const entry = catalog?.models.find((m) => m.id === selection.modelId);
    if (!entry) return t("chat.modelPicker.label");
    const prov = catalog?.providers.find((p) => p.id === entry.providerId);
    return `${prov?.label || "…"} · ${displayName(entry)} (${entry.model})`;
  }, [catalog, selection, t]);

  const groups = useMemo(() => {
    if (!catalog) return [];
    const map = new Map<string, { label: string; models: ModelEntry[] }>();
    for (const p of catalog.providers) {
      map.set(p.id, { label: p.label || p.id, models: [] });
    }
    const sorted = [...catalog.models].sort(
      (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
    );
    for (const m of sorted) {
      let g = map.get(m.providerId);
      if (!g) {
        g = { label: m.providerId, models: [] };
        map.set(m.providerId, g);
      }
      g.models.push(m);
    }
    return [...map.values()].filter((g) => g.models.length > 0);
  }, [catalog]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null);
      return;
    }
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pad = 8;
      const width = Math.min(320, Math.max(260, window.innerWidth - pad * 2));
      let left = rect.left;
      if (left + width > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - width - pad);
      }
      const spaceAbove = rect.top - pad;
      setCoords({
        left,
        bottom: window.innerHeight - rect.top + 6,
        width,
        maxHeight: Math.max(160, Math.min(360, spaceAbove)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  async function apply(next: ModelSelection): Promise<void> {
    setSelection(next);
    setOpen(false);
    try {
      if (sessionId) await setSessionModelSelection(sessionId, next);
      else await setModelSettings({ selection: next });
    } catch {
      /* ignore */
    }
  }

  const selectedModel =
    selection.mode === "manual" ? catalog?.models.find((m) => m.id === selection.modelId) : null;

  // 未配置任何模型时不展示切换器
  if (!ready || !catalog || catalog.models.length === 0) {
    return null;
  }

  return (
    <div className={`composer-model-picker${open ? " is-open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="composer-model-picker__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t("chat.modelPicker.label")}
        title={triggerTitle}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`composer-model-picker__dot${
            selection.mode === "auto"
              ? " is-auto"
              : selectedModel?.health === "error"
                ? " is-error"
                : " is-ok"
          }`}
          aria-hidden
        />
        <span className="composer-model-picker__label">{triggerLabel}</span>
        <svg
          className="composer-model-picker__chevron"
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
              className="composer-model-menu"
              role="listbox"
              aria-label={t("chat.modelPicker.label")}
              style={{
                left: coords.left,
                bottom: coords.bottom,
                width: coords.width,
                maxHeight: coords.maxHeight,
              }}
            >
              <div className="composer-model-menu__scroll">
                <button
                  type="button"
                  role="option"
                  aria-selected={selection.mode === "auto"}
                  className={`composer-model-menu__item composer-model-menu__item--auto${
                    selection.mode === "auto" ? " is-selected" : ""
                  }`}
                  onClick={() => void apply({ mode: "auto" })}
                >
                  <div className="composer-model-menu__item-main">
                    <span className="composer-model-menu__name">{t("chat.modelPicker.auto")}</span>
                    {selection.mode === "auto" ? (
                      <span className="composer-model-menu__check" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </div>
                  <p className="composer-model-menu__desc">{t("chat.modelPicker.autoHint")}</p>
                </button>

                {groups.map((group) => (
                  <div key={group.label} className="composer-model-menu__group" role="group">
                    <div className="composer-model-menu__group-head">{group.label}</div>
                    {group.models.map((m) => {
                      const selected = selection.mode === "manual" && selection.modelId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`composer-model-menu__item${selected ? " is-selected" : ""}${
                            !m.enabled ? " is-disabled-model" : ""
                          }${m.health === "error" ? " is-unhealthy" : ""}`}
                          onClick={() => void apply({ mode: "manual", modelId: m.id })}
                        >
                          <div className="composer-model-menu__item-main">
                            <span
                              className={`composer-model-picker__dot${
                                m.health === "error" ? " is-error" : " is-ok"
                              }`}
                              aria-hidden
                            />
                            <span className="composer-model-menu__name">{displayName(m)}</span>
                            {selected ? (
                              <span className="composer-model-menu__check" aria-hidden>
                                ✓
                              </span>
                            ) : null}
                          </div>
                          <div className="composer-model-menu__meta">
                            <code className="composer-model-menu__id">{m.model || "…"}</code>
                            <div className="composer-model-menu__badges">
                              {m.health === "error" ? (
                                <Badge variant="danger">{t("chat.modelPicker.unhealthy")}</Badge>
                              ) : null}
                              {!m.enabled ? (
                                <Badge variant="neutral">{t("chat.modelPicker.disabled")}</Badge>
                              ) : null}
                              {m.tags
                                .filter((tag) => tag !== "general" && tag !== "vision")
                                .map((tag) => (
                                  <Badge key={tag} variant="accent">
                                    {t(TAG_KEY[tag])}
                                  </Badge>
                                ))}
                              {m.tags.includes("vision") ? (
                                <Badge variant="success">{t(TAG_KEY.vision)}</Badge>
                              ) : null}
                            </div>
                          </div>
                          {m.health === "error" && m.lastError ? (
                            <p className="composer-model-menu__error" title={m.lastError}>
                              {truncate(m.lastError, 72)}
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))}

                {!catalog || catalog.models.length === 0 ? (
                  <p className="composer-model-menu__empty">{t("chat.modelPicker.empty")}</p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
