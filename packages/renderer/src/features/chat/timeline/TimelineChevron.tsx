/**
 * 右侧 > 箭头：收起朝右，展开朝下（设计系统 SVG，与文字光学居中）。
 */
import { ChevronRightIcon } from "@thinker-workbench/design/react";

export function TimelineChevron({ open }: { open: boolean }) {
  return <ChevronRightIcon open={open} size="sm" className="run-timeline-chevron" aria-hidden />;
}
