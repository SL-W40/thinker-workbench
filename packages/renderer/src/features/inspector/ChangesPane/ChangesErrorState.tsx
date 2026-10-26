/**
 * 变更面板失败态：标题 / 说明按失败分类映射，原始报错折叠进「查看错误详情」。
 *
 * 面板上不再直接铺 git 的 stderr —— 那是 git 语言包决定的文本：
 * 既不受应用语言控制（中文 git 在英文界面下也输出中文），又混着命令行回显。
 * 能归类的一律走内部文案，认不出来的才用兜底文案 + 详情弹窗兜住可排查性。
 */
import { Button, EmptyState, Modal } from "@thinker-workbench/design/react";
import type { GitStatus } from "@thinker-workbench/shared";
import { useState } from "react";
import type { MessageKey } from "../../../ui/i18n/translate";
import { useT } from "../../../ui/i18n/useI18n";

type Props = {
  /** 为 null 表示连状态都没拿到（IPC 异常），此时只有 `error` 可用。 */
  status: GitStatus | null;
  error?: string | null;
  onRefresh: () => void;
  onInitRepo: () => void;
};

type Mapped = {
  title: MessageKey;
  body: MessageKey;
  /** 主操作是「初始化仓库」而不是「刷新」。 */
  init?: boolean;
};

/** 失败分类 → 文案；认不出来就落到通用兜底。 */
function mapReason(reason: GitStatus["reason"] | undefined): Mapped {
  switch (reason) {
    case "git_not_found":
      return {
        title: "inspector.changes.gitMissingTitle",
        body: "inspector.changes.gitMissingBody",
      };
    case "not_a_repo":
      return {
        title: "inspector.changes.notRepoTitle",
        body: "inspector.changes.notRepoBody",
        init: true,
      };
    case "cwd_missing":
      return {
        title: "inspector.changes.cwdMissingTitle",
        body: "inspector.changes.cwdMissingBody",
      };
    case "timeout":
      return { title: "inspector.changes.timeoutTitle", body: "inspector.changes.timeoutBody" };
    default:
      return { title: "inspector.changes.errorTitle", body: "inspector.changes.gitErrorBody" };
  }
}

/** 两处来源可能重复（状态里的 detail 与 IPC 异常），去重后再拼。 */
function joinDetail(status: GitStatus | null, error?: string | null): string {
  const parts: string[] = [];
  for (const part of [status?.detail, error]) {
    const text = (part ?? "").trim();
    if (text && !parts.includes(text)) parts.push(text);
  }
  return parts.join("\n\n");
}

export function ChangesErrorState({ status, error, onRefresh, onInitRepo }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const mapped = mapReason(status?.reason);
  const detail = joinDetail(status, error);

  return (
    <div className="changes-pane changes-pane--empty">
      <EmptyState
        title={t(mapped.title)}
        description={t(mapped.body)}
        action={
          <div className="changes-pane__failure-actions">
            <Button
              variant="primary"
              className="changes-pane__primary"
              onClick={mapped.init ? onInitRepo : onRefresh}
            >
              {mapped.init ? t("inspector.changes.initRepo") : t("inspector.refresh")}
            </Button>
            {/* 只有真有技术细节时才出现：多数失败（不是仓库 / 没装 git）本就没有可看的原文 */}
            {detail ? (
              <button
                type="button"
                className="changes-pane__details-link"
                onClick={() => setOpen(true)}
              >
                {t("inspector.changes.viewDetails")}
              </button>
            ) : null}
          </div>
        }
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeOnBackdrop
        closeOnEscape
        aria-labelledby="changes-error-details-title"
      >
        <h2 id="changes-error-details-title" className="components-modal-title">
          {t("inspector.changes.detailsTitle")}
        </h2>
        <pre className="changes-pane__details-text">{detail}</pre>
        <div className="components-row components-row--end">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("inspector.changes.detailsClose")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
