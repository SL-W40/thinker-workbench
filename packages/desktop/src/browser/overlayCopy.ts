/**
 * AI 控制蒙层文案（按界面语言）。
 */
export type OverlayCopy = { title: string; takeControl: string };

/** 纯映射：locale → 蒙层文案；未知 / 非 zh 一律英文。 */
export function overlayCopyFor(locale?: string): OverlayCopy {
  if (locale === "zh") {
    return { title: "AI 控制中", takeControl: "接管" };
  }
  return { title: "AI is controlling", takeControl: "Take control" };
}
