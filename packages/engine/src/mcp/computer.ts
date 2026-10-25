/**
 * 内置 Computer MCP（Windows）：截屏 + 鼠标 / 键盘 / 滚轮控制。
 *
 * 以进程内工具形式注册进 McpManager（id: computer），不起外部 MCP 进程。
 * 输入模拟走 PowerShell（user32 SendInput 系 API + SendKeys），
 * 截图用 GDI+ CopyFromScreen 存 PNG。
 *
 * 截图落盘 `<dataDir>/cache/computer/images/`：
 * - `ui.resultPaths` 供时间线展开缩略图；
 * - `ui.modelImages` 以 image_ref 进入模型上下文（视觉模型可见）。
 *
 * 实现已按域拆分至 ./computer/（sendKeys / powershell / screenshot / actions / tools），
 * 本文件仅保留 barrel 以维持既有导入路径与导出面。
 */
export * from "./computer/index";
