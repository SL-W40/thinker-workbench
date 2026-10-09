/**
 * 把「抛错即失败」的 execute 包成统一的 ToolSpec.run。
 * 未捕获异常会变成 { ok: false, output: 错误信息 }，避免打垮 tools 节点。
 */
import type { DefineToolInput, ToolExecuteResult, ToolSpec } from "./types";

/** 规范化 execute 返回值。 */
function normalizeExecuteResult(result: ToolExecuteResult) {
  if (typeof result === "string") return { output: result };
  return result;
}

/** 构建 ToolSpec：execute 抛错时转为 { ok: false }。 */
export function defineTool(input: DefineToolInput): ToolSpec {
  const { name, description, parameters, execute } = input;
  return {
    name,
    description,
    parameters,
    async run(args, ctx) {
      try {
        const { output, ui, ok } = normalizeExecuteResult(await execute(args, ctx));
        return { ok: ok !== false, output, ...(ui ? { ui } : {}) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, output: message };
      }
    },
  };
}
