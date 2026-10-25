/**
 * ui 层对外出口：跨 feature 复用的展示基建。
 *
 * 收录范围 —— 不属于任何单一 feature、但会被多个 feature 反复引用的展示件与文案能力：
 * - `./icons`：本地 SVG 图标集合
 * - `./i18n`：文案字典与 `useT` / `translate`
 *
 * 本层可以依赖 platform，不得反向依赖 features；因此只被 chat 用到的消息气泡
 * 归属 features/chat/panels/Bubble，不在这里导出。
 */

export { useT } from "./i18n/useI18n";
export { FileGlyph, IconFolder } from "./icons";
