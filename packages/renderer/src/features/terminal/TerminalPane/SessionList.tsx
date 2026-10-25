/**
 * 右侧会话列表：新建分流按钮 + 上下文菜单 + 会话行（含关闭）。
 */
import {
  ChevronRightIcon,
  CloseIcon,
  ContextMenu,
  IconButton,
  PlusIcon,
} from "@thinker-workbench/design/react";
import type { ShellProfile, TerminalSession } from "@thinker-workbench/shared";
import { useRef, useState } from "react";
import { useT } from "../../../ui/i18n/useI18n";

type Props = {
  sessions: TerminalSession[];
  activeId: string | null;
  creating: boolean;
  shellProfiles: ShellProfile[];
  defaultProfile: ShellProfile | null;
  onSelect: (sessionId: string) => void;
  onNew: (profileId?: string) => void;
  onKill: (sessionId: string) => void;
};

export function SessionList({
  sessions,
  activeId,
  creating,
  shellProfiles,
  defaultProfile,
  onSelect,
  onNew,
  onKill,
}: Props) {
  const t = useT();
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newMenuAnchor, setNewMenuAnchor] = useState<DOMRect | null>(null);
  const newSplitRef = useRef<HTMLDivElement>(null);

  function openNewMenu() {
    const rect = newSplitRef.current?.getBoundingClientRect() ?? null;
    setNewMenuAnchor(rect);
    setNewMenuOpen((v) => !v);
  }

  const defaultShellLabel = defaultProfile?.name?.trim() || "…";

  return (
    <aside className="terminal-pane__list" aria-label={t("terminal.sessions")}>
      <div className="terminal-pane__list-head">
        <span className="terminal-pane__list-label">{t("terminal.sessions")}</span>
        <div
          ref={newSplitRef}
          className={`terminal-pane__new-split${newMenuOpen ? " is-open" : ""}`}
        >
          <button
            type="button"
            className="terminal-pane__default-shell"
            title={defaultProfile?.name ?? t("terminal.newMenu")}
            aria-label={t("terminal.newMenu")}
            aria-expanded={newMenuOpen}
            aria-haspopup="menu"
            disabled={creating || shellProfiles.length === 0}
            onClick={openNewMenu}
          >
            {defaultShellLabel}
          </button>
          <IconButton
            aria-label={t("terminal.new")}
            size="sm"
            variant="ghost"
            disabled={creating}
            onClick={() => onNew()}
          >
            <PlusIcon size="sm" />
          </IconButton>
          <IconButton
            aria-label={t("terminal.newMenu")}
            aria-expanded={newMenuOpen}
            aria-haspopup="menu"
            size="sm"
            variant="ghost"
            disabled={creating || shellProfiles.length === 0}
            onClick={openNewMenu}
          >
            <ChevronRightIcon size="sm" className="terminal-pane__new-chev" />
          </IconButton>
        </div>
        <ContextMenu
          open={newMenuOpen}
          anchor={newMenuAnchor}
          onClose={() => setNewMenuOpen(false)}
          aria-label={t("terminal.newMenu")}
          items={shellProfiles.map((p) => ({
            label: p.name,
            onSelect: () => {
              onNew(p.id);
            },
          }))}
        />
      </div>
      <ul className="terminal-pane__sessions">
        {sessions.map((s) => (
          <li key={s.sessionId}>
            <button
              type="button"
              className={`terminal-pane__session${s.sessionId === activeId ? " is-active" : ""}`}
              onClick={() => onSelect(s.sessionId)}
            >
              <span
                className={`terminal-pane__dot${
                  s.status === "running" || s.status === "starting" ? " is-running" : ""
                }`}
              />
              <span className="terminal-pane__session-title">
                {s.title || s.sessionId.slice(0, 8)}
                {s.fromAgent ? (
                  <span className="terminal-pane__badge">
                    {s.backgrounded ? t("chat.shellBackgrounded") : t("terminal.fromAgent")}
                  </span>
                ) : null}
              </span>
            </button>
            <IconButton
              aria-label={t("terminal.kill")}
              size="sm"
              variant="ghost"
              onClick={() => onKill(s.sessionId)}
            >
              <CloseIcon />
            </IconButton>
          </li>
        ))}
      </ul>
    </aside>
  );
}
