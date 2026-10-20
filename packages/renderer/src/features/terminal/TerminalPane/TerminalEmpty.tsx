/**
 * Terminal 空态 / 不可用态（不可用时无 CTA，空态可带「新建」）。
 */
import { Button, ConsoleIcon, EmptyState, PlusIcon } from "@thinker-workbench/design/react";

type Props = {
  title: string;
  description: string;
  /** 传入则渲染「新建」CTA。 */
  action?: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
  };
  /** 不可用态撑满整格（外层容器类名不同）。 */
  full?: boolean;
};

export function TerminalEmpty({ title, description, action, full = false }: Props) {
  const actionNode = action ? (
    <Button
      size="sm"
      variant="primary"
      disabled={action.disabled}
      startIcon={<PlusIcon size="sm" />}
      onClick={action.onClick}
    >
      {action.label}
    </Button>
  ) : undefined;

  const inner = (
    <div className="terminal-pane__empty">
      <EmptyState
        className="terminal-pane__empty-state"
        icon={
          <span className="terminal-pane__empty-icon" aria-hidden="true">
            <ConsoleIcon size="lg" />
          </span>
        }
        title={title}
        description={description}
        action={actionNode}
      />
    </div>
  );

  return full ? <div className="terminal-pane terminal-pane--empty">{inner}</div> : inner;
}
