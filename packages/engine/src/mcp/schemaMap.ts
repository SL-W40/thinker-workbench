/**
 * MCP inputSchema → 发给模型的 parameters（尽量透传）。
 */

/** 保证是 object schema；否则包一层。 */
export function normalizeMcpParameters(inputSchema: unknown): Record<string, unknown> {
  if (
    inputSchema &&
    typeof inputSchema === "object" &&
    !Array.isArray(inputSchema) &&
    (inputSchema as { type?: unknown }).type === "object"
  ) {
    return inputSchema as Record<string, unknown>;
  }
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
    description:
      typeof inputSchema === "object" && inputSchema
        ? `Original schema: ${JSON.stringify(inputSchema).slice(0, 500)}`
        : "No parameters",
  };
}
