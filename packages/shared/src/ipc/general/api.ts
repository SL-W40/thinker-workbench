import type {
  DataDirChangePreview,
  DataDirChangeRequest,
  DataDirChangeResult,
  DataDirMigrateProgress,
  DataDirPaths,
} from "../dataDir";
import type { AttentionPreviewKind } from "./defaults";
import type { GeneralSettings } from "./settings";

/** Preload 暴露的通用设置 API。 */
export type ThinkerGeneralApi = {
  /** 异步读取完整通用设置。 */
  getGeneral(): Promise<GeneralSettings>;
  /** 同步快照，供启动闪屏 / 首帧绘制（Electron preload）。 */
  getGeneralSync?: () => GeneralSettings;
  /** 应用部分补丁并返回合并后的完整设置。 */
  setGeneral(patch: Partial<GeneralSettings>): Promise<GeneralSettings>;
  /**
   * 订阅其它窗口保存的通用设置（主题 / 语言等）。
   * 发起 `setGeneral` 的窗口不会收到自己的这次推送。
   * @returns 取消订阅函数
   */
  onGeneralChanged?(cb: (general: GeneralSettings) => void): () => void;
  /** 触发一次性预览（忽略开关与焦点门控）。 */
  previewAttention(kind: AttentionPreviewKind): Promise<void>;
  /** 打开系统目录选择框；取消时返回 `null`。 */
  pickDirectory?(options?: { title?: string; defaultPath?: string }): Promise<string | null>;
  /**
   * 打开系统「另存为」并写入文本；取消返回 `null`，成功返回保存路径。
   */
  saveTextFile?(options: {
    content: string;
    defaultPath?: string;
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null>;
  /**
   * 解析数据根与 settings 路径。
   * 省略参数时用当前已生效配置；传入草稿串可预览「保存后」落点。
   */
  resolveDataDir?(configured?: string): Promise<DataDirPaths>;
  /** 预览数据目录变更（不落盘）。 */
  previewDataDirChange?(dataDir: string): Promise<DataDirChangePreview>;
  /** 应用数据目录变更（须无 running 会话；可选择迁移）。 */
  applyDataDirChange?(request: DataDirChangeRequest): Promise<DataDirChangeResult>;
  /** 订阅迁移进度。 */
  onDataDirMigrateProgress?(cb: (progress: DataDirMigrateProgress) => void): () => void;
};
