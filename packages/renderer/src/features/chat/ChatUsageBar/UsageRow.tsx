/**
 * 明细行：色点 + 标签 + 数值
 */
export function UsageRow({
  label,
  value,
  swatch,
  nested = false,
  valueClassName,
}: {
  label: string;
  value: string;
  swatch?: "input" | "output" | "hit" | "miss" | "write" | "reasoning" | "reply" | "none";
  nested?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={`chat-usage-row${nested ? " is-nested" : " is-parent"}`}>
      <span className="chat-usage-row__label">
        {swatch && swatch !== "none" ? (
          <span className={`chat-usage-swatch chat-usage-swatch--${swatch}`} aria-hidden />
        ) : nested ? (
          <span className="chat-usage-swatch chat-usage-swatch--none" aria-hidden />
        ) : null}
        {label}
      </span>
      <span className={`chat-usage-row__value${valueClassName ? ` ${valueClassName}` : ""}`}>
        {value}
      </span>
    </div>
  );
}
