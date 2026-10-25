/**
 * 工具展示名：时间线工具行不再直接显示模型看到的原始工具名。
 *
 * - 展示名走 i18n（`chat.toolNames.*`），中英文各一份；
 * - MCP 工具（`mcp__{server}__{tool}`）剥掉前缀显示短名；
 * - 未登记的工具（以后新增的内置工具）回退原始名。
 */
import type { MessageKey } from "../../../ui/i18n/translate";
import type { Translate } from "./format";

/** 内置工具名 → 展示名文案键（与 engine 工具注册表一一对应）。 */
const TOOL_NAME_KEYS: Record<string, MessageKey> = {
  read_file: "chat.toolNames.readFile",
  edit_file: "chat.toolNames.editFile",
  write_file: "chat.toolNames.writeFile",
  delete_file: "chat.toolNames.deleteFile",
  grep: "chat.toolNames.grep",
  list_dir: "chat.toolNames.listDir",
  search_files: "chat.toolNames.searchFiles",
  time: "chat.toolNames.time",
  ask_user: "chat.toolNames.askUser",
  create_plan: "chat.toolNames.createPlan",
  update_plan: "chat.toolNames.updatePlan",
  todo: "chat.toolNames.todo",
  request_mode_switch: "chat.toolNames.requestModeSwitch",
  shell: "chat.toolNames.shell",
  shell_await: "chat.toolNames.shellAwait",
  shell_write: "chat.toolNames.shellWrite",
  Task: "chat.toolNames.task",
  task_await: "chat.toolNames.taskAwait",
  task_cancel: "chat.toolNames.taskCancel",
  browser_navigate: "chat.toolNames.browserNavigate",
  browser_lock: "chat.toolNames.browserLock",
  browser_snapshot: "chat.toolNames.browserSnapshot",
  browser_click: "chat.toolNames.browserClick",
  browser_type: "chat.toolNames.browserType",
  browser_fill: "chat.toolNames.browserFill",
  browser_press_key: "chat.toolNames.browserPressKey",
  browser_scroll: "chat.toolNames.browserScroll",
  browser_evaluate: "chat.toolNames.browserEvaluate",
  browser_resize: "chat.toolNames.browserResize",
  browser_get_styles: "chat.toolNames.browserGetStyles",
  browser_screenshot: "chat.toolNames.browserScreenshot",
};

/** MCP 工具名前缀：`mcp__{serverId}__{toolName}`（与 engine 的命名规则一致）。 */
const MCP_PREFIX = "mcp__";

/** 是否 MCP 工具名。 */
export function isMcpTool(name: string): boolean {
  if (!name.startsWith(MCP_PREFIX)) return false;
  return name.slice(MCP_PREFIX.length).indexOf("__") > 0;
}

/** 剥掉 `mcp__{server}__` 前缀后的短工具名；非 MCP 原样返回。 */
export function shortToolName(name: string): string {
  if (!isMcpTool(name)) return name;
  const rest = name.slice(MCP_PREFIX.length);
  const short = rest.slice(rest.indexOf("__") + 2);
  return short || name;
}

/** 时间线展示的工具名：内置工具走 i18n，MCP 显示短名，未登记回退原始名。 */
export function toolDisplayName(t: Translate, name: string): string {
  if (isMcpTool(name)) return shortToolName(name);
  const key = TOOL_NAME_KEYS[name];
  return key ? t(key) : name;
}
