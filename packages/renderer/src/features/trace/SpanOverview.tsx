/**
 * Trace 详情顶部：节点、身份和用量放在一张卡片里。
 */
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { useI18n } from "../../i18n/useI18n";
import { callTreeLabel } from "./callTreeModel";
import { buildSpanOverview, outcomeLabel, type OverviewNames } from "./overviewModel";

type Props = {
  span: TraceSpanRecord;
  output: unknown;
  names?: OverviewNames;
};

export function SpanOverview({ span, output, names }: Props) {
  const { locale, t } = useI18n();
  const model = buildSpanOverview(span, output, locale, names);
  const status = span.status ?? "running";
  return (
    <section className="trace-overview">
      <header className="trace-overview__head">
        <h3>{callTreeLabel(span)}</h3>
        <span className={`trace-overview__badge is-${model.partial ? "partial" : model.partial === false ? "complete" : status}`}>
          {outcomeLabel(locale, status, model.partial)}
        </span>
      </header>
      <p className="trace-overview__meta">
        {model.chips.map((chip, index) => (
          <span key={`${chip}-${index}`}>{chip}</span>
        ))}
      </p>
      <p className="trace-overview__when">{model.when}</p>
      {model.rows.length > 0 ? (
        <dl className="trace-overview__rows">
          {model.rows.map((row) => (
            <div key={row.label} className={row.block ? "is-block" : undefined}>
              <dt>{row.label}</dt>
              <dd>
                {row.name ? <span className="trace-overview__name">{row.name} </span> : null}
                <span className={row.mono ? "is-mono" : undefined}>
                  {row.name ? `(${row.value})` : row.value}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {model.stats.length > 0 ? (
        <div className="trace-overview__usage">
          <h4>{t("tools.trace.tokenUsage")}</h4>
          <dl className="trace-overview__stats">
            {model.stats.map((stat) => (
              <div key={stat.label} className="trace-overview__stat">
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
