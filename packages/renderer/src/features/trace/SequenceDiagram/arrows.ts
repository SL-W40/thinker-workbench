/**
 * 箭头几何：序号徽章靠起点，标签居中在箭头上方，避免与徽章叠在中点。
 * Δx 过小则自调用回环。
 */

/** 同泳道或 Δx 过小时强制自调用回环，避免零长线只剩箭头尖。*/
export const MIN_ARROW_DX = 12;

export function arrowEndpoints(
  x1: number,
  x2: number,
  y: number,
):
  | {
      mode: "line";
      startX: number;
      endX: number;
      midX: number;
      badgeX: number;
      labelY: number;
      arrowY: number;
    }
  | {
      mode: "loop";
      path: string;
      badgeX: number;
      labelX: number;
      labelY: number;
      arrowY: number;
    } {
  // 行内分层：标签在上 / 箭头在中 / 不把徽章放标签上
  const arrowY = y + 6;
  const labelY = y - 10;
  if (Math.abs(x2 - x1) < MIN_ARROW_DX) {
    const x = x2;
    return {
      mode: "loop",
      path: `M ${x + 5} ${arrowY - 6} C ${x + 24} ${arrowY - 6}, ${x + 24} ${arrowY + 6}, ${x + 5} ${arrowY + 6}`,
      badgeX: x - 14,
      labelX: x + 22,
      labelY,
      arrowY,
    };
  }
  const dirRight = x2 >= x1;
  const startX = dirRight ? x1 + 6 : x1 - 6;
  const endX = dirRight ? x2 - 6 : x2 + 6;
  let midX = (startX + endX) / 2;
  // 徽章贴在起点内侧，与标签中点分离
  const badgeX = dirRight ? startX + 11 : startX - 11;
  // 短箭头时把标签中点往终点挪一点，避免压住序号
  if (Math.abs(midX - badgeX) < 28) {
    midX = dirRight ? Math.min(endX - 8, badgeX + 36) : Math.max(endX + 8, badgeX - 36);
  }
  return { mode: "line", startX, endX, midX, badgeX, labelY, arrowY };
}
