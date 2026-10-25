/**
 * 底部输入区（编排壳）：多行草稿 + `/` Skills / `@` 文件弹出 + 发送/停止。
 * 图标见 ./glyphs，@ 候选路径收集见 ./mentionPaths。
 */
import {
  Button,
  Callout,
  FolderIcon,
  IconButton,
  PaperclipIcon,
} from "@thinker-workbench/design/react";
import type {
  ChatAttachmentRef,
  ChatMessage,
  ChatTodo,
  SkillListItem,
} from "@thinker-workbench/shared";
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
} from "../../../platform/ipc/thinker";
import { workspaceTree } from "../../../platform/ipc/workspaceFs";
import { useT } from "../../../ui/i18n/useI18n";
import { loadFileRecents } from "../../inspector/fileRecents";
import { SessionTodoBar } from "../panels/SessionTodoBar";
import { ModelPicker } from "../pickers/ModelPicker";
import { ModePicker } from "../pickers/ModePicker";
import { BackgroundTasksBar } from "../usage/BackgroundTasksBar";
import { ContextUsageControl } from "../usage/ContextUsageControl";
import { ComposerEditor, type ComposerEditorHandle } from "./ComposerEditor";
import { ComposerMentionPanel, type MentionItem } from "./ComposerMentionPanel";
import {
  type ActiveMention,
  applyMentionInsert,
  detectActiveMention,
  formatAtPath,
  formatSlashSkill,
} from "./composerMentions";
import { rankFileMentions, truncateDirLeft } from "./fileMentionRank";
import { SendGlyph, StopGlyph } from "./glyphs";
import { collectMentionPaths, SKILLS_PAGE } from "./mentionPaths";

type Props = {
  draft: string;
  onAttachFiles?: (files: File[]) => void;
  attachments?: ChatAttachmentRef[];
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
  /** 会话待办：展示在输入框上方（会话级状态，独立于计划）。 */
  todos?: ChatTodo[];
  /** 清理已完成待办（只保留未完成项）。 */
  onClearCompletedTodos?: () => void;
  gateMessage?: string | null;
  onOpenWorkspace?: () => void;
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
};

export function Composer({
  draft,
  onAttachFiles,
  attachments,
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
  todos = [],
  onClearCompletedTodos,
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
  }, [inputRef]);

  useEffect(() => {
    refreshMention();
  }, [refreshMention]);

  /** 草稿中含图片类附件芯片时提示视觉标签（仍发送）。 */
  const hasImageAttachments = (attachments ?? []).some((a) => a.mime.startsWith("image/"));

  useEffect(() => {
    const onChanged = () => setModelCatalogTick((n) => n + 1);
    window.addEventListener(MODEL_SETTINGS_CHANGED, onChanged);
    return () => window.removeEventListener(MODEL_SETTINGS_CHANGED, onChanged);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: modelCatalogTick 未在函数体读取但刻意保留：模型设置变化后需要重新查询健康模型
  useEffect(() => {
    if (!hasImageAttachments) {
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
  }, [hasImageAttachments, sessionId, modelCatalogTick]);

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

  const canSend = Boolean(draft.trim());

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
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    // 统一附件流：图片与非图片都落盘为 @file:<id> 芯片
    onAttachFiles?.(files);
  }

  return (
    <footer className="composer-dock">
      {/* `/` Skills 与 `@` 文件候选：composer 最顶端的背景面板（内联，非浮层弹窗） */}
      <ComposerMentionPanel
        open={Boolean(mention) && items.length > 0}
        kind={mention?.kind ?? "slash"}
        items={items}
        highlight={highlight}
        onHighlight={setHighlight}
        onSelect={selectItem}
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
      <SessionTodoBar todos={todos} running={busy} onClearCompleted={onClearCompletedTodos} />
      <BackgroundTasksBar threadId={threadId ?? undefined} onOpenTerminal={onOpenTerminal} />
      {visionUntagged && hasImageAttachments ? (
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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 输入区外壳承载拖拽投放，交互核心在内部编辑器 */}
      <div
        className={`composer-shell${busy ? " is-busy" : ""}${dragOver ? " is-dragover" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <ComposerEditor
          ref={inputRef}
          value={draft}
          placeholder={t("chat.placeholder")}
          onChange={onDraftChange}
          onKeyDown={handleKeyDown}
          onCaretChange={refreshMention}
          attachments={attachments}
          onPasteFiles={(files) => {
            if (!onAttachFiles || files.length === 0) return false;
            void onAttachFiles(files);
            return true;
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) onAttachFiles?.(files);
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
              aria-label={t("chat.attachments.attach")}
              title={t("chat.attachments.attach")}
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
