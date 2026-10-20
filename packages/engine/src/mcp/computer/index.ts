/**
 * computer 目录 barrel：保持 `mcp/computer` 的既有导入路径与导出面不变。
 */

export { escapeSendKeysText, toSendKeys } from "./sendKeys";
export {
  COMPUTER_MCP_ID,
  COMPUTER_MCP_NAME,
  type ComputerToolDef,
  callComputerTool,
  computerToolDefs,
} from "./tools";
