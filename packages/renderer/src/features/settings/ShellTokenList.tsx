/**
 * Shell 命令首 token 列表编辑器（白名单 / 黑名单共用）。
 * 输入行 + 芯片列表；移除用 IconButton，避免整颗芯片当按钮的歧义。
 */
import { Button, CloseIcon, IconButton, Input } from "@thinker-workbench/design/react";

type Props = {
  tokens: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (token: string) => void;
  placeholder: string;
  addLabel: string;
  removeLabel: string;
  emptyHint: string;
  /** 芯片色：白名单中性，黑名单危险色。 */
  tone?: "neutral" | "danger";
};

export function ShellTokenList({
  tokens,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
  placeholder,
  addLabel,
  removeLabel,
  emptyHint,
  tone = "neutral",
}: Props) {
  return (
    <div className="settings-token-list">
      <div className="settings-token-list__add">
        <Input
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            onAdd();
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!draft.trim()}
          onClick={onAdd}
        >
          {addLabel}
        </Button>
      </div>
      {tokens.length === 0 ? (
        <p className="settings-token-list__empty">{emptyHint}</p>
      ) : (
        <ul className="settings-token-list__chips">
          {tokens.map((token) => (
            <li key={token}>
              <span
                className={`settings-token-list__chip${
                  tone === "danger" ? " settings-token-list__chip--danger" : ""
                }`}
              >
                <code>{token}</code>
                <IconButton
                  size="sm"
                  variant="ghost"
                  className="settings-token-list__remove"
                  aria-label={`${removeLabel}: ${token}`}
                  onClick={() => onRemove(token)}
                >
                  <CloseIcon />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
