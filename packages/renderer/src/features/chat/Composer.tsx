/**
 * 底部输入区：多行草稿 + 发送/停止合一按钮。
 * 忙碌时同一按钮变为停止（进度环 + 方块），空草稿且非忙碌时禁用发送。
 * 当前工作空间名称放在输入壳下方。
 */

import { Button, Callout, FolderIcon, IconButton } from "@thinker-workbench/design/react";
import type { ChatMessage } from "@thinker-workbench/shared";
import type { KeyboardEvent, RefObject } from "react";
import { useT } from "../../i18n/I18nProvider";
import { ContextUsageControl } from "./ContextUsageControl";

type Props = {
  draft: string;
  busy: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onCancel: () => void;
  /** 当前选中的工作空间显示名。 */
  workspaceName?: string | null;
  /** 工作区绝对路径（上下文估算用）。 */
  workspaceRoot?: string | null;
  /** 当前会话消息（上下文估算用）。 */
  messages?: ChatMessage[];
  /** 无工作空间等前置条件未满足时的提示。 */
  gateMessage?: string | null;
  /** 门禁为「无工作空间」时展示 Open，点击打开文件夹。 */
  onOpenWorkspace?: () => void;
  /** 崩溃 / 中断后可续跑时展示 Resume。 */
  canResume?: boolean;
  onResume?: () => void;
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

/** 单一 SVG：进度环与停止方块同中心（不叠 Spinner）。 */
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
  messages = [],
  gateMessage,
  onOpenWorkspace,
  canResume = false,
  onResume,
}: Props) {
  const t = useT();

  return (
    <footer className="composer-dock">
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
          onKeyDown={onKeyDown}
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
