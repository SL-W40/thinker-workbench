/**
 * 时间线公共常量：排队槽 id、过渡行标记、输出与子代理条数上限。阈值会被多个模块共用，调整前确认影响面。
 */
/** 排队等待文案的时间线 id。出队、失败或取消后整段去掉。 */
export const QUEUED_WAIT_STEP_ID = "queued-wait";

/** 单行小结（承上启下）的字符上限；超过按普通回复正文渲染。 */
export const TRANSITION_TEXT_MAX = 60;

/**
 * 承上启下小结的标记行前缀：模型按提示词约定在调工具前输出 `[NEXT] 一句话`。
 */
export const TRANSITION_MARKER = "[NEXT]";

/** 小结内容字符上限（用户要求 ≤50 字）。 */
export const TRANSITION_MARKER_MAX = 50;

/** 标记行正则（整行匹配，g 供全文扫描）。 */
export const TRANSITION_LINE_RE = /^[ \t]*\[NEXT\][ \t]*(.*)$/gm;

export const LIVE_OUTPUT_CAP = 12_000;

export const MAX_SUBAGENT_ENTRIES = 80;
