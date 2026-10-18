/**
 * 无工具补全抽象：把一次 system+user 的模型补全封装成 ChatFn。
 * 抽取 / 摘要都走它（不传 tools），便于单测注入假实现。
 */

import { getChatModel, MODEL_API_KEY_MISSING } from "../model/openai";
import type { ChatModel } from "../model/types";
import type { ChatFn } from "./repository";

/** 由给定 ChatModel 构造 ChatFn。 */
export function createChatFn(model: ChatModel): ChatFn {
  return async (system: string, user: string) => {
    const result = await model.chat(
      { system, messages: [{ role: "user", content: user }] },
      new AbortController().signal,
    );
    return result.content;
  };
}

/**
 * 从运行时主模型构造 ChatFn；未配置 API key 时返回 null（调用方据此降级跳过抽取）。
 */
export function createChatFnFromRuntime(): ChatFn | null {
  try {
    return createChatFn(getChatModel());
  } catch (err) {
    if (err instanceof Error && err.message === MODEL_API_KEY_MISSING) return null;
    throw err;
  }
}
