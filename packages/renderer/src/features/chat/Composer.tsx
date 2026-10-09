/**
 * 底部输入区：多行草稿 + `/` Skills / `@` 文件弹出 + 发送/停止。
 */

import { Button, Callout, FolderIcon, IconButton } from "@thinker-workbench/design/react";
import type { ChatMessage, SkillListItem } from "@thinker-workbench/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { listSkills } from "../../bridge/thinker";
import { workspaceTree } from "../../bridge/workspaceFs";
import { useT } from "../../i18n/I18nProvider";
import { BackgroundTasksBar } from "./BackgroundTasksBar";
import {
  applyMentionInsert,
  detectActiveMention,
  formatAtPath,
  formatSlashSkill,
  type ActiveMention,
} from "./composerMentions";
import {
  ComposerMentionPopup,
  getTextareaCaretAnchor,
  type MentionItem,
} from "./ComposerMentionPopup";
import { ContextUsageControl } from "./ContextUsageControl";
import { loadFileRecents } from "../inspector/fileRecents";

type Props = {
  draft: string;
  busy: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onCancel: () => void;
  workspaceName?: string | null;
  workspaceRoot?: string | null;
  workspaceId?: string | null;
  messages?: ChatMessage[];
  gateMessage?: string | null;
  onOpenWorkspace?: () => void;
  canResume?: boolean;
  onResume?: () => void;
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
};

/** 发送箭头图标（圆底）；原位编辑气泡复用。 */
export function SendGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path
        className="composer-send-glyph"
        d="M8 11.1V5M8 5 5.4 7.6M8 5l2.6 2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg className="composer-stop" width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle
        className="composer-stop__track"
        cx="11"
        cy="11"
        r="9.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle
        className="composer-stop__arc"
        cx="11"
        cy="11"
        r="9.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="14 44"
      />
      <rect x="7.25" y="7.25" width="7.5" height="7.5" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function collectFilePaths(
  node: { path?: string; kind?: string; children?: unknown[] } | null,
): string[] {
  if (!node) return [];
  if (node.kind === "file" && typeof node.path === "string") return [node.path];
  return (node.children ?? []).flatMap((c) =>
    collectFilePaths(c as { path?: string; kind?: string; children?: unknown[] }),
  );
}

const SKILLS_PAGE = 8;

export function Composer({
  draft,
  busy,
  inputRef,
  onDraftChange,
  onKeyDown,
  onSend,
  onCancel,
  workspaceName,
  workspaceRoot = null,
  workspaceId = null,
  messages = [],
  gateMessage,
  onOpenWorkspace,
  canResume = false,
  onResume,
  onOpenTerminal,
}: Props) {
  const t = useT();
  const [mention, setMention] = useState<ActiveMention | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number } | null>(
    null,
  );
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [skillsExpanded, setSkillsExpanded] = useState(false);

  // 预加载 skills / 文件树
  useEffect(() => {
    let cancelled = false;
    void listSkills(workspaceRoot).then((list) => {
      if (!cancelled) setSkills(list);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot]);

  useEffect(() => {
    if (!workspaceId) {
      setFilePaths([]);
      return;
    }
    let cancelled = false;
    void workspaceTree(workspaceId)
      .then((tree) => {
        if (!cancelled) setFilePaths(collectFilePaths(tree));
      })
      .catch(() => {
        if (!cancelled) setFilePaths([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const refreshMention = useCallback(() => {
    const el = inputRef.current;
    if (!el) {
      setMention(null);
      return;
    }
    const caret = el.selectionStart ?? draft.length;
    const next = detectActiveMention(draft, caret);
    setMention(next);
    setSkillsExpanded(false);
    if (next) {
      setAnchor(getTextareaCaretAnchor(el));
      setHighlight(0);
    } else {
      setAnchor(null);
    }
  }, [draft, inputRef]);

  useEffect(() => {
    refreshMention();
  }, [draft, refreshMention]);

  const recentPaths = useMemo(
    () => loadFileRecents(workspaceId),
    [workspaceId, mention?.kind],
  );

  const items: MentionItem[] = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    if (mention.kind === "slash") {
      const filtered = skills.filter(
        (s) =>
          !q ||
          s.name.includes(q) ||
          s.description.toLowerCase().includes(q),
      );
      const visible = skillsExpanded ? filtered : filtered.slice(0, SKILLS_PAGE);
      return visible.map((s) => ({
        id: `skill:${s.name}`,
        label: s.name,
        description: s.description,
        group: "skills" as const,
      }));
    }
    // @ files
    if (!workspaceId) return [];
    const recents = recentPaths
      .filter((p) => !q || p.toLowerCase().includes(q))
      .map((p) => ({
        id: `recent:${p}`,
        label: p,
        description: t("chat.mention.recent"),
        group: "recent" as const,
      }));
    const recentSet = new Set(recentPaths);
    const files = filePaths
      .filter((p) => !recentSet.has(p))
      .filter((p) => !q || p.toLowerCase().includes(q))
      .slice(0, 40)
      .map((p) => ({
        id: `file:${p}`,
        label: p,
        group: "files" as const,
      }));
    return [...recents, ...files];
  }, [
    mention,
    skills,
    skillsExpanded,
    workspaceId,
    recentPaths,
    filePaths,
    t,
  ]);

  const skillsHiddenCount = useMemo(() => {
    if (!mention || mention.kind !== "slash" || skillsExpanded) return 0;
    const q = mention.query.toLowerCase();
    const filtered = skills.filter(
      (s) =>
        !q ||
        s.name.includes(q) ||
        s.description.toLowerCase().includes(q),
    );
    return Math.max(0, filtered.length - SKILLS_PAGE);
  }, [mention, skills, skillsExpanded]);

  const selectItem = useCallback(
    (item: MentionItem) => {
      if (!mention) return;
      const insert =
        mention.kind === "slash"
          ? formatSlashSkill(item.label)
          : formatAtPath(item.label);
      const { text, caret } = applyMentionInsert(draft, mention, insert);
      onDraftChange(text);
      setMention(null);
      window.requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [mention, draft, onDraftChange, inputRef],
  );

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = items[highlight] ?? items[0];
        if (item) selectItem(item);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    onKeyDown(e);
  }

  return (
    <footer className="composer-dock">
      <BackgroundTasksBar onOpenTerminal={onOpenTerminal} />
      {gateMessage ? (
        <Callout
          tone="warning"
          className="composer-gate"
          action={
            onOpenWorkspace ? (
              <Button size="sm" variant="secondary" onClick={onOpenWorkspace}>
                {t("chat.openWorkspace")}
              </Button>
            ) : undefined
          }
        >
          {gateMessage}
        </Callout>
      ) : null}
      {canResume && !gateMessage ? (
        <Callout
          tone="info"
          className="composer-resume"
          action={
            <Button size="sm" variant="primary" disabled={busy} onClick={() => onResume?.()}>
              {t("chat.resume")}
            </Button>
          }
        >
          {t("chat.resumeHint")}
        </Callout>
      ) : null}
      <div className={`composer-shell${busy ? " is-busy" : ""}`}>
        <textarea
          ref={inputRef}
          className="composer-input"
          rows={2}
          value={draft}
          placeholder={t("chat.placeholder")}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={refreshMention}
          onKeyUp={refreshMention}
          onSelect={refreshMention}
        />
        <div className="composer-bar">
          <ContextUsageControl
            messages={messages}
            draft={draft}
            workspaceRoot={workspaceRoot}
          />
          <IconButton
            className={`composer-send${busy ? " composer-send--stop" : ""}`}
            size="lg"
            variant="secondary"
            disabled={busy ? false : !draft.trim()}
            onClick={() => {
              if (busy) onCancel();
              else onSend();
            }}
            aria-label={busy ? t("chat.stop") : t("chat.send")}
            aria-busy={busy || undefined}
            title={busy ? t("chat.stop") : t("chat.sendHint")}
          >
            <span className="composer-send__ico" aria-hidden="true">
              {busy ? <StopGlyph /> : <SendGlyph />}
            </span>
          </IconButton>
        </div>
      </div>
      <ComposerMentionPopup
        open={Boolean(mention)}
        kind={mention?.kind ?? "slash"}
        items={items}
        highlight={highlight}
        anchor={anchor}
        onHighlight={setHighlight}
        onSelect={selectItem}
        onClose={() => setMention(null)}
        skillsCollapsed={!skillsExpanded}
        onExpandSkills={() => setSkillsExpanded(true)}
        skillsHiddenCount={skillsHiddenCount}
        emptyHint={
          mention?.kind === "at" && !workspaceId
            ? t("chat.mention.needWorkspace")
            : t("chat.mention.empty")
        }
      />
      {workspaceName ? (
        <span className="composer-workspace" title={workspaceName}>
          <FolderIcon size="sm" />
          <span className="composer-workspace__name">{workspaceName}</span>
        </span>
      ) : (
        <span className="composer-workspace is-empty">{t("chat.noWorkspaceLabel")}</span>
      )}
    </footer>
  );
}
