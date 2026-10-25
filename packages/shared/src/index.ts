/**
 * 包根 barrel。
 *
 * 导出原先逐行堆在 index.ts（572 行）；现按来源目录分组到 exports/ 下，
 * 这里统一再导出——导出面与拆分前逐项一致，对外部不可见。
 */

export * from "./exports/browser";
export * from "./exports/core";
export * from "./exports/ipc";
export * from "./exports/protocol";
