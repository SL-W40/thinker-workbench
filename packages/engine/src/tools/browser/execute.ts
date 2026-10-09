/**
 * 内置浏览器工具执行体（经 utility → main WebContentsView）。
 */
import { browserCall } from "../../host/browserClient";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";

function str(args: ToolArgs, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

function num(args: ToolArgs, key: string): number | undefined {
  const v = args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function bool(args: ToolArgs, key: string): boolean | undefined {
  const v = args[key];
  return typeof v === "boolean" ? v : undefined;
}

function formatResult(result: { output: string; screenshotPath?: string }): string {
  if (!result.screenshotPath) return result.output;
  return `${result.output}\n\nscreenshotPath: ${result.screenshotPath}`;
}

export async function browserNavigateTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const url = str(args, "url");
  if (!url?.trim()) throw new Error("url is required");
  const result = await browserCall(
    "navigate",
    {
      url,
      reveal: bool(args, "reveal") !== false,
      takeScreenshotAfterwards: bool(args, "take_screenshot_afterwards"),
    },
    ctx.signal,
  );
  return { output: formatResult(result) };
}

export async function browserLockTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const action = str(args, "action");
  if (action !== "lock" && action !== "unlock") {
    throw new Error('action must be "lock" or "unlock"');
  }
  const result = await browserCall(action, {}, ctx.signal);
  return { output: formatResult(result) };
}

export async function browserSnapshotTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const result = await browserCall(
    "snapshot",
    { takeScreenshotAfterwards: bool(args, "take_screenshot_afterwards") },
    ctx.signal,
  );
  return { output: formatResult(result) };
}

export async function browserClickTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const ref = str(args, "ref");
  if (!ref?.trim()) throw new Error("ref is required");
  const button = str(args, "button") as "left" | "right" | "middle" | undefined;
  const result = await browserCall(
    "click",
    {
      ref,
      element: str(args, "element"),
      doubleClick: bool(args, "double_click"),
      button,
      takeScreenshotAfterwards: bool(args, "take_screenshot_afterwards"),
    },
    ctx.signal,
  );
  return { output: formatResult(result) };
}

export async function browserTypeTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const ref = str(args, "ref");
  const text = str(args, "text");
  if (!ref?.trim()) throw new Error("ref is required");
  if (typeof text !== "string") throw new Error("text is required");
  const result = await browserCall(
    "type",
    {
      ref,
      text,
      element: str(args, "element"),
      takeScreenshotAfterwards: bool(args, "take_screenshot_afterwards"),
    },
    ctx.signal,
  );
  return { output: formatResult(result) };
}

export async function browserFillTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const ref = str(args, "ref");
  const value = str(args, "value");
  if (!ref?.trim()) throw new Error("ref is required");
  if (typeof value !== "string") throw new Error("value is required");
  const result = await browserCall(
    "fill",
    {
      ref,
      value,
      element: str(args, "element"),
      takeScreenshotAfterwards: bool(args, "take_screenshot_afterwards"),
    },
    ctx.signal,
  );
  return { output: formatResult(result) };
}

export async function browserPressKeyTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const key = str(args, "key");
  if (!key?.trim()) throw new Error("key is required");
  const result = await browserCall(
    "pressKey",
    {
      key,
      ref: str(args, "ref"),
      takeScreenshotAfterwards: bool(args, "take_screenshot_afterwards"),
    },
    ctx.signal,
  );
  return { output: formatResult(result) };
}

export async function browserScrollTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const direction = str(args, "direction") as
    | "up"
    | "down"
    | "left"
    | "right"
    | undefined;
  const result = await browserCall(
    "scroll",
    {
      ref: str(args, "ref"),
      direction,
      amount: num(args, "amount"),
      scrollIntoView: bool(args, "scroll_into_view"),
      takeScreenshotAfterwards: bool(args, "take_screenshot_afterwards"),
    },
    ctx.signal,
  );
  return { output: formatResult(result) };
}

export async function browserEvaluateTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const script = str(args, "script");
  if (!script?.trim()) throw new Error("script is required");
  const result = await browserCall(
    "evaluate",
    {
      script,
      takeScreenshotAfterwards: bool(args, "take_screenshot_afterwards"),
    },
    ctx.signal,
  );
  return { output: formatResult(result) };
}

export async function browserResizeTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const width = num(args, "width");
  const height = num(args, "height");
  if (width == null || height == null) throw new Error("width and height are required");
  const result = await browserCall("resize", { width, height }, ctx.signal);
  return { output: formatResult(result) };
}

export async function browserGetStylesTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const ref = str(args, "ref");
  const selector = str(args, "selector");
  if (!ref?.trim() && !selector?.trim()) {
    throw new Error("ref or selector is required");
  }
  let properties: string[] | undefined;
  if (typeof args.properties === "string" && args.properties.trim()) {
    properties = args.properties
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  } else if (Array.isArray(args.properties)) {
    properties = args.properties.filter((p): p is string => typeof p === "string");
  }
  const result = await browserCall(
    "getStyles",
    { ref, selector, properties },
    ctx.signal,
  );
  return { output: formatResult(result) };
}

export async function browserScreenshotTool(
  _args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const result = await browserCall("screenshot", {}, ctx.signal);
  return { output: formatResult(result) };
}
