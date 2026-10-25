import type { CustomThemeRecord } from "../customTheme";
import type { AiLocale, AppLocale } from "../locale";
import type { AppFontScale } from "./fontScale";
import type { HttpCompatibilityMode } from "./http";
import type { ShellApprovalMode } from "./shellPolicy";
import type { AppThemeId } from "./theme";
import type { WorkspaceAccess } from "./workspaceAccess";

/** 通用设置完整形状。 */
export type GeneralSettings = {
  /** agent 完成或需要关注时是否发系统通知。 */
  systemNotifications: boolean;
  /** 是否保留托盘图标；关窗时隐藏到托盘而非退出。 */
  systemTrayIcon: boolean;
  /** agent 完成或需要关注时是否播放提示音。 */
  completionSound: boolean;
  /** Renderer UI 语言。 */
  uiLocale: AppLocale;
  /** 模型回复偏好语言（含智能跟随）。 */
  aiLocale: AiLocale;
  /**
   * 文件工具工作区外访问档位。
   * 相对路径始终相对当前工作区根；本字段只控制绝对路径能否越界。
   */
  workspaceAccess: WorkspaceAccess;
  /**
   * 是否允许 AI 调用 `delete_file` 删除工作区文件（或经访问档位允许的路径）。
   * 关闭后不向模型暴露该工具；若仍被调用则执行失败。
   */
  allowAiDeleteFiles: boolean;
  /**
   * 删除文件后「恢复」缓存保留天数；超时自动丢弃且不可恢复。
   * `0` 表示不按时间过期（仍可手动恢复后清除）。
   */
  deleteFileRestoreTtlDays: number;
  /**
   * 外观主题偏好。
   * 内置：`light` / `dark` / `system` / `notes` / `eyecare` / `aurora`；
   * 或 `customThemes` 中的 `custom_*` id。
   */
  uiTheme: AppThemeId;
  /** 用户自定义主题目录（完整色板快照）。 */
  customThemes: CustomThemeRecord[];
  /** UI 整体缩放档位（小 / 中 / 大）。 */
  uiFontScale: AppFontScale;
  /** 首次启动引导是否已完成（或已跳过）。 */
  onboardingCompleted: boolean;
  /**
   * 应用根目录（与默认 `~/.thinker` 同级：catalog / 工作空间 DB / 日志 / session / skills / mcps…）。
   * 空字符串表示默认 `~/.thinker`。
   * 变更须手动保存并确认是否迁移；`setGeneral` 会忽略本字段。
   * 引导用 `settings.json` 始终在 `~/.thinker/`，不随本字段移动。
   */
  dataDir: string;
  /**
   * 日志保留天数；超过则自动删掉更早 SQLite 分片。
   * `0` 表示永不按时间清理。
   */
  logRetentionDays: number;
  /**
   * 写入日志 meta 时是否截断长文本。
   * 关闭则尽量保留全文（仍受极端上限保护）。
   */
  logTruncateLongContent: boolean;
  /**
   * 是否产出日志（文件 / 内存 / 回调）。
   * 关闭后各进程不再写入新日志。
   */
  loggingEnabled: boolean;
  /**
   * 是否允许 AI 调用 shell / shell_await。
   * 关闭后不向模型暴露这些工具。
   */
  allowAiShell: boolean;
  /**
   * 是否允许 AI 调用内置浏览器工具（navigate / snapshot / click 等）。
   * 关闭后不向模型暴露这些工具。
   */
  allowAiBrowser: boolean;
  /**
   * 是否允许 AI 调用只读 Git 检视工具（git_status / git_diff）。
   * 写操作始终不开放；关闭后连这两个工具也不暴露给模型。
   */
  allowAiGit: boolean;
  /**
   * 默认 shell profile id；`default` 表示平台默认（Win PowerShell / Unix $SHELL）。
   */
  shellProfileId: string;
  /** 命令行审批策略。 */
  shellApprovalMode: ShellApprovalMode;
  /**
   * 免审命令首 token 白名单。
   * 磁盘缺字段时用 `DEFAULT_SHELL_ALLOWLIST`；已存空数组 `[]` 保留为空。
   * 与 `shellBlocklist` 重叠时以黑名单为准，重叠项从本列表剔除。
   */
  shellAllowlist: string[];
  /**
   * 命令首 token 硬拒绝名单。
   * 命中后任何审批模式、白名单免审、AI 放行与 HITL 确认都不能执行，也不能加入白名单。
   * 磁盘缺字段时为空（不回填）；已存空数组 `[]` 保留为空。
   */
  shellBlocklist: string[];
  /** 本地 file:// 链接是否在内置浏览器打开（否则走系统默认应用）。 */
  openLocalLinksInBrowser: boolean;
  /** 模型 HTTP 客户端兼容模式（HTTP/2 vs HTTP/1.1）。 */
  httpCompatibilityMode: HttpCompatibilityMode;
  /**
   * 同时处于 running 的聊天会话软上限（跨工作区合计）。
   * 超限时新 run 进入 FIFO；队列也满（或深度为 0）才拒绝。同 thread 仍始终互斥。
   */
  maxParallelRuns: number;
  /**
   * 全局等待队列最大深度。0 表示不排队。
   * 调低后已在队列中的项保留，只拒绝新的入队。
   */
  maxQueuedRuns: number;
  /**
   * 单条排队的最长等待（分钟）。0 表示不超时。
   * 超时后该条失败，不影响其它 run。
   */
  queueTimeoutMin: number;
  /**
   * 主会话最大执行步数（LangGraph superstep）：每轮模型调用与每次工具执行各计 1 步。
   */
  maxAgentSteps: number;
  /** Task / 子代理最大执行步数（每次模型调用与每次工具执行各计 1 步）。 */
  maxSubagentSteps: number;
  /** 模型请求最大尝试次数（含首次）。 */
  modelRetryMaxAttempts: number;
  /** 模型重试首次基础延迟（ms）。 */
  modelRetryBaseDelayMs: number;
  /**
   * 串行工具调用间最小间隔（ms）：上一个工具结束到下一个工具开始的最小时长。
   * 与渲染端时间线尾卡「最小时长 + 收起动画」对齐——默认 850+180+缓冲≈1200ms，
   * 即「最短展示 + 动画时长」，保证上一张卡完全收起、planning/thinking 抑制已释放，再发起下一个调用。
   * `0` 表示不强制间隔。
   */
  toolCallMinGapMs: number;
  /** shell / shell_await 默认 block_until_ms。 */
  defaultShellBlockUntilMs: number;
  /** shell 输出进模型前的字符上限。 */
  shellOutputCap: number;
  /** MCP 连接超时（ms）。 */
  mcpConnectTimeoutMs: number;
  /** MCP 工具调用超时（ms）。 */
  mcpCallTimeoutMs: number;
  /** `@` 单文件最大字节。 */
  contextFilesMaxFileBytes: number;
  /** `@` 注入合计最大字节。 */
  contextFilesMaxTotalBytes: number;
  /** read_file 默认 max_chars。 */
  readFileDefaultMaxChars: number;
  /** 是否采集本机 Trace span。 */
  observabilityEnabled: boolean;
};
