/**
 * 手动提交表单：自己填说明，直接调 git（`gitCommit -a`）。
 *
 * 只在「⋯」菜单里选了「手动提交」后才出现 —— 常态面板上不留这一块，
 * 提交入口就是头部那个「提交」按钮。
 *
 * 只管提交，不管推送：推送是另一件事，不塞进提交这一步里。
 */
import { Button, Input } from "@thinker-workbench/design/react";
import { useEffect, useRef, useState } from "react";
import { gitCommit } from "../../../platform/ipc/git";
import { useT } from "../../../ui/i18n/useI18n";

type Props = {
  workspaceId: string;
  /** 提交完成后通知上层刷新 Git 状态。 */
  onChanged: () => void;
  /** 关掉表单，回到常态。 */
  onClose: () => void;
  /** 批量处置进行中：同一批快照别并发改。 */
  busy?: boolean;
};

export function ManualCommitForm({ workspaceId, onChanged, onClose, busy = false }: Props) {
  const t = useT();
  const [committing, setCommitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = busy || committing;

  // 展开表单就把光标放进输入框：少一次点击
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function commit() {
    if (locked) return;
    const text = message.trim();
    if (!text) {
      setError(t("inspector.changes.commitMessageRequired"));
      return;
    }
    setCommitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await gitCommit({ workspaceId, message: text, all: true });
      if (!res.ok) setError(res.error ?? t("inspector.changes.commitFailed"));
      else {
        setMessage("");
        setNotice(
          res.commit
            ? `${t("inspector.changes.committed")} ${res.commit}`
            : t("inspector.changes.committed"),
        );
        onChanged();
      }
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="changes-dispose">
      <div className="changes-dispose__row">
        <Input
          ref={inputRef}
          size="sm"
          className="changes-dispose__message"
          value={message}
          placeholder={t("inspector.changes.commitPlaceholder")}
          aria-label={t("inspector.changes.commitPlaceholder")}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void commit();
            }
          }}
        />
        <Button
          size="sm"
          variant="primary"
          busy={committing}
          disabled={locked}
          onClick={() => void commit()}
        >
          {t("inspector.changes.doCommit")}
        </Button>
        <Button size="sm" variant="ghost" disabled={locked} onClick={onClose}>
          {t("inspector.changes.cancel")}
        </Button>
      </div>
      {error ? <div className="changes-pane__error">{error}</div> : null}
      {notice ? <div className="changes-dispose__notice">{notice}</div> : null}
    </div>
  );
}
