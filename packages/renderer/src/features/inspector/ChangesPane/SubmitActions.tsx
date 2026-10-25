/**
 * 头部提交入口：`[提交 | ⌄]` 分裂按钮。
 *
 * 主按钮直接跑默认动作（建分支并提交），chev 展开全套：
 * 「AI 代办」的六种走法 → 手动提交 → 批量处置。
 * 动作列表就在按钮上，不用再去别处找。
 */
import { Button } from "@thinker-workbench/design/react";
import { useT } from "../../../ui/i18n/useI18n";
import { IconChevron } from "../../../ui/icons";
import type { ChangesPromptActionId } from "./actions";
import { AI_COMMIT_ACTIONS, DEFAULT_COMMIT_ACTION } from "./actions";
import { PortalMenu } from "./floatingMenu";
import { usePortalMenu } from "./usePortalMenu";

type Props = {
  /** 没有改动（或不是仓库）时整组禁用。 */
  disabled: boolean;
  onSendAction: (id: ChangesPromptActionId) => void;
  /** 选「手动提交」：展开输入框。 */
  onManual: () => void;
  /** 批量处置进行中：菜单项禁用。 */
  disposeBusy: boolean;
  onRevertAll: () => void;
  onKeepAll: () => void;
};

export function SubmitActions({
  disabled,
  onSendAction,
  onManual,
  disposeBusy,
  onRevertAll,
  onKeepAll,
}: Props) {
  const t = useT();
  // 菜单比视图选项宽：里有「创建分支、提交并推送」这种长标签
  const menu = usePortalMenu(240);

  return (
    <div className="changes-commit" ref={menu.wrapRef}>
      <Button
        className="changes-commit__main"
        size="sm"
        variant="primary"
        disabled={disabled}
        onClick={() => onSendAction(DEFAULT_COMMIT_ACTION)}
      >
        {/* 按钮标签就是它真正要执行的那件事，不用写「提交」再让人去猜 */}
        {t(`inspector.changes.cta.${DEFAULT_COMMIT_ACTION}` as "inspector.changes.cta.commit")}
      </Button>
      <button
        type="button"
        className="changes-commit__chev"
        aria-label={t("inspector.changes.commitMenu")}
        title={t("inspector.changes.commitMenu")}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        disabled={disabled}
        onClick={menu.toggle}
      >
        <IconChevron open={menu.open} size={12} />
      </button>

      <PortalMenu
        open={menu.open}
        coords={menu.coords}
        menuRef={menu.menuRef}
        className="changes-pane__menu--wide"
      >
        <div className="changes-pane__menu-label">{t("inspector.changes.aiGroup")}</div>
        {AI_COMMIT_ACTIONS.map((id) => (
          <button
            key={id}
            type="button"
            className="changes-pane__menu-item"
            role="menuitem"
            disabled={disabled}
            onClick={() => {
              menu.close();
              onSendAction(id);
            }}
          >
            {t(`inspector.changes.cta.${id}` as "inspector.changes.cta.commit")}
          </button>
        ))}

        <div className="changes-pane__menu-sep" aria-hidden />
        <button
          type="button"
          className="changes-pane__menu-item"
          role="menuitem"
          disabled={disabled}
          onClick={() => {
            menu.close();
            onManual();
          }}
        >
          {t("inspector.changes.manualCommit")}
        </button>

        {/* 批量处置：处置的是 AI 写进来的改动，与提交由谁执行无关，所以放在最后 */}
        <div className="changes-pane__menu-sep" aria-hidden />
        <button
          type="button"
          className="changes-pane__menu-item changes-pane__menu-item--danger"
          role="menuitem"
          disabled={disabled || disposeBusy}
          onClick={() => {
            menu.close();
            onRevertAll();
          }}
        >
          {t("inspector.changes.revertAll")}
        </button>
        <button
          type="button"
          className="changes-pane__menu-item"
          role="menuitem"
          disabled={disabled || disposeBusy}
          onClick={() => {
            menu.close();
            onKeepAll();
          }}
        >
          {t("inspector.changes.keepAll")}
        </button>
      </PortalMenu>
    </div>
  );
}
