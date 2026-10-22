/**
 * 底部输入区：多行草稿 + `/` Skills / `@` 文件弹出 + 发送/停止。

 */
import {
  Button,
  Callout,
  FolderIcon,
  IconButton,
  PaperclipIcon,
} from "@thinker-workbench/design/react";
import type { ChatMessage, SkillListItem } from "@thinker-workbench/shared";
import {
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getModelSettings,
  getSessionModelSelection,
  listSkills,
  MODEL_SETTINGS_CHANGED,
} from "../../bridge/thinker";
import { workspaceTree } from "../../bridge/workspaceFs";
import { useT } from "../../i18n/useI18n";
import { loadFileRecents } from "../inspector/fileRecents";
import { BackgroundTasksBar } from "./BackgroundTasksBar";
import { ChatImageStrip, type DraftChatImage } from "./ChatImageStrip";
import { ComposerEditor, type ComposerEditorHandle } from "./ComposerEditor";
import { ComposerMentionPopup, type MentionItem } from "./ComposerMentionPopup";
import { ContextUsageControl } from "./ContextUsageControl";
import {
  type ActiveMention,
  applyMentionInsert,
  detectActiveMention,
  formatAtPath,
  formatSlashSkill,
} from "./composerMentions";
import { rankFileMentions, truncateDirLeft } from "./fileMentionRank";
import { ModelPicker } from "./ModelPicker";
import { ModePicker } from "./ModePicker";

type Props = {
  draft: string;
  draftImages?: DraftChatImage[];
  onAttachImages?: (files: File[]) => void;
  onRemoveImage?: (id: string) => void;
  busy: boolean;
  /** 本会话在 FIFO 中等待：可取消，但模型 / 模式仍可改。 */
  queued?: boolean;
  inputRef: RefObject<ComposerEditorHandle | null>;
  onDraftChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onSend: () => void;
  onCancel: () => void;
  workspaceName?: string | null;
  workspaceRoot?: string | null;
  workspaceId?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
  messages?: ChatMessage[];
  gateMessage?: string | null;
  onOpenWorkspace?: () => void;
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
};

/** 发送箭头图标（圆底）；原位编辑气泡复用*/
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

type TreeNodeLite = { path?: string; type?: string; children?: unknown[] };

/** 收集工作区文件与目录相对路径（供 `@` 检索；跳过以 `.` 开头的项）。*/
function collectMentionPaths(node: TreeNodeLite | null): { path: string; isDir: boolean }[] {
  if (!node) return [];
  const out: { path: string; isDir: boolean }[] = [];
  const walk = (n: TreeNodeLite) => {
    const p = typeof n.path === "string" ? n.path.replace(/\\/g, "/") : "";
    if (p && p !== ".") {
      if (n.type === "file") out.push({ path: p, isDir: false });
      else if (n.type === "dir") out.push({ path: p, isDir: true });
    }
    for (const c of n.children ?? []) {
      walk(c as TreeNodeLite);
    }
  };
  walk(node);
  return out;
}

const SKILLS_PAGE = 8;

export function Composer({
  draft,
  draftImages = [],
  onAttachImages,
  onRemoveImage,
  busy,
  queued = false,
  inputRef,
  onDraftChange,
  onKeyDown,
  onSend,
  onCancel,
  workspaceName,
  workspaceRoot = null,
  workspaceId = null,
  sessionId = null,
  threadId = null,
  messages = [],
  gateMessage,
  onOpenWorkspace,
  onOpenTerminal,
}: Props) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** 当前选用模型未标 vision 时提示（仍发送图片）。 */
  const [visionUntagged, setVisionUntagged] = useState(false);
  const [modelCatalogTick, setModelCatalogTick] = useState(0);
  const [mention, setMention] = useState<ActiveMention | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [mentionPaths, setMentionPaths] = useState<{ path: string; isDir: boolean }[]>([]);
  const [skillsExpanded, setSkillsExpanded] = useState(false);
  /** Esc / 点外侧关掉后，同一触发段（自 start）不再弹，直到离开该段*/
  const dismissedMentionRef = useRef<{ kind: ActiveMention["kind"]; start: number } | null>(null);

  const dismissMention = useCallback((active: ActiveMention | null) => {
    if (active) {
      dismissedMentionRef.current = { kind: active.kind, start: active.start };
    }
    setMention(null);
    setAnchor(null);
  }, []);

  // 预加载 skills / 文件树（含目录，供 @ 检索）
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
      setMentionPaths([]);
      return;
    }
    let cancelled = false;
    void workspaceTree(workspaceId)
      .then((tree) => {
        if (!cancelled) setMentionPaths(collectMentionPaths(tree));
      })
      .catch(() => {
        if (!cancelled) setMentionPaths([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const refreshMention = useCallback(() => {
    const editor = inputRef.current;
    if (!editor) {
      setMention(null);
      return;
    }
    const value = editor.getValue();
    const caret = editor.getSelectionStart();

    // 触发符被删掉后解除抑制；空格结束 mention 时仍保留抑制（退格不会立刻再弹）
    const dismissed = dismissedMentionRef.current;
    if (dismissed) {
      const ch = value[dismissed.start];
      const stillThere =
        (dismissed.kind === "at" && ch === "@") || (dismissed.kind === "slash" && ch === "/");
      if (!stillThere) dismissedMentionRef.current = null;
    }

    let next = detectActiveMention(value, caret);
    const d = dismissedMentionRef.current;
    if (next && d && next.kind === d.kind && next.start === d.start) {
      next = null;
    } else if (next && d && (next.start !== d.start || next.kind !== d.kind)) {
      dismissedMentionRef.current = null;
    }

    // 同一触发段内只更新锚点，勿重置 highlight（否则 ↑↓ 会被 keyup 打回第 0 项）
    setMention((prev) => {
      const same =
        Boolean(prev && next) &&
        prev?.kind === next?.kind &&
        prev?.start === next?.start &&
        prev?.query === next?.query;
      if (next && !same) {
        setSkillsExpanded(false);
        setHighlight(0);
      }
      return next;
    });
    if (next) setAnchor(editor.getCaretAnchor());
    else setAnchor(null);
  }, [inputRef]);

  useEffect(() => {
    refreshMention();
  }, [refreshMention]);

  const hasReadyImages = draftImages.some((img) => !img.uploading && Boolean(img.path.trim()));

  useEffect(() => {
    const onChanged = () => setModelCatalogTick((n) => n + 1);
    window.addEventListener(MODEL_SETTINGS_CHANGED, onChanged);
    return () => window.removeEventListener(MODEL_SETTINGS_CHANGED, onChanged);
  }, []);

  useEffect(() => {
    if (!hasReadyImages) {
      setVisionUntagged(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const cat = await getModelSettings();
        let sel = cat.selection;
        if (sessionId) {
          const override = await getSessionModelSelection(sessionId);
          if (override) sel = override;
        }
        if (cancelled) return;
        const healthy = cat.models.filter((m) => m.enabled && m.health === "ok");
        const untagged =
          sel.mode === "manual"
            ? !cat.models.find((m) => m.id === sel.modelId)?.tags.includes("vision")
            : !healthy.some((m) => m.tags.includes("vision"));
        setVisionUntagged(untagged);
      } catch {
        if (!cancelled) setVisionUntagged(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasReadyImages, sessionId, modelCatalogTick]);

  const recentPaths = useMemo(() => loadFileRecents(workspaceId), [workspaceId]);

  const items: MentionItem[] = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    if (mention.kind === "slash") {
      const filtered = skills.filter(
        (s) => !q || s.name.includes(q) || s.description.toLowerCase().includes(q),
      );
      const visible = skillsExpanded ? filtered : filtered.slice(0, SKILLS_PAGE);
      return visible.map((s) => ({
        id: `skill:${s.name}`,
        label: s.name,
        description: s.description,
        group: "skills" as const,
      }));
    }
    // @ 文件/目录：空查询只出最近；输入后在全库模糊搜（Quick Open：
    if (!workspaceId) return [];
    if (!q) {
      return rankFileMentions(mentionPaths, recentPaths, "", 10).map((hit) => ({
        id: `recent:${hit.path}`,
        label: hit.isDir ? `${hit.path.replace(/\/+$/, "")}/` : hit.path,
        title: hit.isDir ? `${hit.name}/` : hit.name,
        description: truncateDirLeft(hit.dir) || undefined,
        group: "recent" as const,
        query: "",
        isDir: hit.isDir,
      }));
    }
    return rankFileMentions(mentionPaths, recentPaths, q, 40).map((hit) => ({
      id: `${hit.isDir ? "dir" : "file"}:${hit.path}`,
      label: hit.isDir ? `${hit.path.replace(/\/+$/, "")}/` : hit.path,
      title: hit.isDir ? `${hit.name}/` : hit.name,
      description: truncateDirLeft(hit.dir) || undefined,
      group: "files" as const,
      query: q,
      isDir: hit.isDir,
    }));
  }, [mention, skills, skillsExpanded, workspaceId, recentPaths, mentionPaths]);

  const skillsHiddenCount = useMemo(() => {
    if (mention?.kind !== "slash" || skillsExpanded) return 0;
    const q = mention.query.toLowerCase();
    const filtered = skills.filter(
      (s) => !q || s.name.includes(q) || s.description.toLowerCase().includes(q),
    );
    return Math.max(0, filtered.length - SKILLS_PAGE);
  }, [mention, skills, skillsExpanded]);

  const selectItem = useCallback(
    (item: MentionItem) => {
      if (!mention) return;
      const insert =
        mention.kind === "slash" ? formatSlashSkill(item.label) : formatAtPath(item.label);
      const { text, caret } = applyMentionInsert(draft, mention, insert);
      onDraftChange(text);
      setMention(null);
      window.requestAnimationFrame(() => {
        const editor = inputRef.current;
        if (!editor) return;
        editor.focus();
        editor.setSelectionRange(caret, caret);
        refreshMention();
      });
    },
    [mention, draft, onDraftChange, inputRef, refreshMention],
  );

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // IME 组合中勿抢占方向键 / Enter，否则无法选字
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (mention) {
      if (items.length > 0) {
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
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // 关掉后同一段 `@`/`/` 保持原文，不再自动弹搜索
        dismissMention(mention);
        return;
      }
      if (e.key === " " || e.key === "Spacebar") {
        // 空格正常插入，并标记该触发段已结束（退格删空格也不会立刻再弹）
        dismissMention(mention);
      }
    }
    onKeyDown(e);
  }

  const canSend =
    Boolean(draft.trim()) || draftImages.some((img) => !img.uploading && Boolean(img.path.trim()));

  function takeImageFiles(list: FileList | File[] | null | undefined): File[] {
    if (!list) return [];
    return Array.from(list).filter((f) => f.type.startsWith("image/"));
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    setDragOver(false);
    const files = takeImageFiles(e.dataTransfer.files);
    if (files.length === 0) return;
    e.preventDefault();
    onAttachImages?.(files);
  }

  return (
    <footer className="composer-dock">
      <BackgroundTasksBar threadId={threadId ?? undefined} onOpenTerminal={onOpenTerminal} />
      {visionUntagged && hasReadyImages ? (
        <Callout tone="warning" className="composer-gate">
          {t("chat.images.visionUntagged")}
        </Callout>
      ) : null}
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
      <div
        className={`composer-shell${busy ? " is-busy" : ""}${dragOver ? " is-dragover" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <ChatImageStrip images={draftImages} onRemove={onRemoveImage} />
        <ComposerEditor
          ref={inputRef}
          value={draft}
          placeholder={t("chat.placeholder")}
          onChange={onDraftChange}
          onKeyDown={handleKeyDown}
          onCaretChange={refreshMention}
          onPasteImages={(files) => {
            if (!onAttachImages || files.length === 0) return false;
            void onAttachImages(files);
            return true;
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif"
          multiple
          hidden
          onChange={(e) => {
            const files = takeImageFiles(e.target.files);
            e.target.value = "";
            if (files.length) onAttachImages?.(files);
          }}
        />
        <div className="composer-bar">
          <div className="composer-bar-left">
            <ModePicker sessionId={sessionId} />
            <ModelPicker sessionId={sessionId} />
          </div>
          <div className="composer-bar-right">
            <ContextUsageControl messages={messages} draft={draft} workspaceRoot={workspaceRoot} />
            <IconButton
              className="composer-attach"
              size="md"
              variant="ghost"
              aria-label={t("chat.images.attach")}
              title={t("chat.images.attach")}
              onClick={() => fileInputRef.current?.click()}
            >
              <PaperclipIcon />
            </IconButton>
            <IconButton
              className={`composer-send${busy || queued ? " composer-send--stop" : ""}`}
              size="lg"
              variant="secondary"
              disabled={busy || queued ? false : !canSend}
              onClick={() => {
                if (busy || queued) onCancel();
                else onSend();
              }}
              aria-label={busy ? t("chat.stop") : queued ? t("chat.leaveQueue") : t("chat.send")}
              aria-busy={busy || undefined}
              title={busy ? t("chat.stop") : queued ? t("chat.leaveQueue") : t("chat.sendHint")}
            >
              <span className="composer-send__ico" aria-hidden="true">
                {busy || queued ? <StopGlyph /> : <SendGlyph />}
              </span>
            </IconButton>
          </div>
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
        onClose={() => dismissMention(mention)}
        skillsCollapsed={!skillsExpanded}
        onExpandSkills={() => setSkillsExpanded(true)}
        skillsHiddenCount={skillsHiddenCount}
        emptyHint={
          mention?.kind === "at" && !workspaceId
            ? t("chat.mention.needWorkspace")
            : mention?.kind === "at" && !mention.query
              ? t("chat.mention.noRecent")
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
