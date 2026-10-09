/**
 * time 工具规格：返回当前时间（ISO-8601）。
 * 环境上下文已含一轮调用时的时钟；需要刷新时再用本工具。
 */
import { defineTool } from "../defineTool";
import { timeTool } from "./execute";

export const timeToolSpec = defineTool({
  name: "time",
  description:
    "Returns a fresh current timestamp (ISO-8601). Prefer environment_context.time from the system message unless you need an updated clock mid-run.",
  parameters: {
    type: "object",
    properties: {},
  },
  execute: timeTool,
});
