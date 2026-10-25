/**
 * Trace 详情面板：拖宽手柄 + 折叠 + span 概览与输入输出 payload。
 */
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  IconButton,
  Spinner,
} from "@thinker-workbench/design/react";
import type { TracePayloadRecord, TraceSpanRecord } from "@thinker-workbench/shared";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useT } from "../../../ui/i18n/useI18n";
import type { OverviewNames } from "../overviewModel";
import { omitOutputOverview } from "../overviewModel";
import { SpanOverview } from "../SpanOverview";
import { TracePayloadView } from "../TracePayloadView";
import { DETAIL_WIDTH_MAX, DETAIL_WIDTH_MIN } from "./detailPrefs";

type Props = {
  detailCollapsed: boolean;
  detailWidth: number;
  selectedSpan: TraceSpanRecord | null;
  payloadIn: TracePayloadRecord | null;
  payloadOut: TracePayloadRecord | null;
  overviewNames: OverviewNames;
  loadingSpans: boolean;
  runSpanCount: number;
  onToggleCollapsed: () => void;
  onResizeStart: (clientX: number, width: number) => void;
};

export function TraceDetail({
  detailCollapsed,
  detailWidth,
  selectedSpan,
  payloadIn,
  payloadOut,
  overviewNames,
  loadingSpans,
  runSpanCount,
  onToggleCollapsed,
  onResizeStart,
}: Props) {
  const t = useT();

  return (
    <aside className={`trace-pane__detail${detailCollapsed ? " is-collapsed" : ""}`}>
      {detailCollapsed ? null : (
        // biome-ignore lint/a11y/useSemanticElements: 详情面板拖宽手柄，ARIA separator + 指针拖拽模式，无对应原生控件
        <div
          className="trace-pane__detail-resize"
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={DETAIL_WIDTH_MIN}
          aria-valuemax={DETAIL_WIDTH_MAX}
          aria-valuenow={detailWidth}
          aria-label={t("tools.trace.resizeDetail")}
          title={t("tools.trace.resizeDetail")}
          onPointerDown={(event: ReactPointerEvent) => {
            event.preventDefault();
            onResizeStart(event.clientX, detailWidth);
          }}
        />
      )}
      <div className="trace-pane__detail-bar">
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t(
            detailCollapsed ? "tools.trace.expandDetail" : "tools.trace.collapseDetail",
          )}
          title={t(detailCollapsed ? "tools.trace.expandDetail" : "tools.trace.collapseDetail")}
          onClick={onToggleCollapsed}
        >
          {detailCollapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
        </IconButton>
      </div>
      {detailCollapsed ? null : !selectedSpan ? (
        loadingSpans || runSpanCount > 0 ? (
          <div className="trace-pane__loading">
            <Spinner />
          </div>
        ) : null
      ) : (
        <div className="trace-pane__detail-body">
          <SpanOverview span={selectedSpan} output={payloadOut?.json} names={overviewNames} />
          {payloadIn ? (
            <TracePayloadView
              title={t("tools.trace.input")}
              payload={payloadIn}
              truncatedLabel={t("tools.trace.truncated")}
              partialLabel={t("tools.trace.partial")}
            />
          ) : null}
          {payloadOut ? (
            <TracePayloadView
              title={t("tools.trace.output")}
              payload={{ ...payloadOut, json: omitOutputOverview(payloadOut.json) }}
              truncatedLabel={t("tools.trace.truncated")}
              partialLabel={t("tools.trace.partial")}
            />
          ) : null}
        </div>
      )}
    </aside>
  );
}
