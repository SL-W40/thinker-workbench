/**
 * 记忆子系统单测：压缩（micro/session/full）、token 预算、会话抽取、autoCompact 编排。
 * 全部使用注入的假 ChatFn / MemoryRepository，不触碰 LLM / DB / ALS。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { AutoCompactor } from "../../src/memory/compact/autoCompact";
import { fullCompact } from "../../src/memory/compact/full";
import { microCompact } from "../../src/memory/compact/micro";
import { sessionCompact } from "../../src/memory/compact/session";
import type {
  ChatFn,
  MemoryKind,
  MemoryRepository,
  MemoryTraceIds,
} from "../../src/memory/repository";
import { presentSessionMemory, SessionMemoryServiceImpl } from "../../src/memory/sessionMemory";
import { ContextBudgetImpl, estimateMessageTokens } from "../../src/memory/tokenBudget";
import type { ChatMessage } from "../../src/model/types";

// --- helpers ---

function makeMessages(n: number): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: "init" }];
  for (let i = 1; i < n; i++) {
    out.push({ role: "user", content: `message number ${i}` });
  }
  return out;
}

/** 每条消息固定 per 字符，便于把 token 估算推过预算阈值。 */
function bigMessages(n: number, per = 3000): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: "x".repeat(per) }];
  for (let i = 1; i < n; i++) {
    out.push({ role: "user", content: "x".repeat(per) });
  }
  return out;
}

/** 单条消息、总字符数受控，用于精确验证预算阈值。 */
function singleCharMessage(total: number): ChatMessage[] {
  return [{ role: "user", content: "x".repeat(total) }];
}

/** 构造带成对 tool 调用的序列，用于验证安全切分。 */
function makeToolPairSequence(n: number): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: "init" }];
  for (let i = 0; i < n; i++) {
    const id = `c${i}`;
    out.push({
      role: "assistant",
      content: `ask ${i}`,
      tool_calls: [{ id, type: "function", function: { name: "f", arguments: "{}" } }],
    });
    out.push({ role: "tool", content: `result ${i}`, tool_call_id: id });
  }
  return out;
}

function fakeRepo(): MemoryRepository {
  const store = new Map<string, string>();
  return {
    async load(s: string, k: MemoryKind) {
      return store.get(`${s}::${k}`) ?? null;
    },
    async save(s: string, k: MemoryKind, c: string) {
      store.set(`${s}::${k}`, c);
    },
  };
}

const trace: MemoryTraceIds = { sessionId: "sess-1", traceId: "t1", agentRunId: "r1" };

const SECTIONED = [
  "## Session Summary",
  "- did a thing",
  "## Key Decisions",
  "- chose X",
  "## Code Changes",
  "- edited a.ts",
  "## Discoveries",
  "- found Y",
  "## Next Steps",
  "- do Z",
].join("\n");

function waitFor(predicate: () => boolean | Promise<boolean>, timeout = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      let ok = false;
      try {
        ok = await predicate();
      } catch {
        ok = false;
      }
      if (ok) return resolve();
      if (Date.now() - start > timeout) return reject(new Error("wait timeout"));
      setTimeout(tick, 5);
    };
    void tick();
  });
}

// --- micro ---

describe("microCompact", () => {
  it("不修改原数组，返回新数组", () => {
    const msgs = makeMessages(10);
    const out = microCompact(msgs, { keepFirst: 1, keepRecent: 4 });
    assert.notEqual(out, msgs);
    assert.deepEqual(msgs, makeMessages(10));
  });

  it("消息总数未超阈值时原样返回（但仍为新数组）", () => {
    const msgs = makeMessages(5);
    const out = microCompact(msgs, { keepFirst: 1, keepRecent: 8 });
    assert.notEqual(out, msgs);
    assert.equal(out.length, 5);
  });

  it("超阈值时丢弃中段，保留首条与最近窗口", () => {
    const msgs = makeMessages(40);
    const out = microCompact(msgs, { keepFirst: 1, keepRecent: 6 });
    assert.equal(out.length, 1 + 6);
    const firstOut = out[0];
    const lastOut = out[out.length - 1];
    assert.ok(firstOut && lastOut);
    assert.equal(firstOut.content, "init");
    assert.equal(lastOut.content, "message number 39");
  });

  it("安全切分：不切断 tool 结果与悬空 tool_calls", () => {
    const msgs = makeToolPairSequence(20); // 41 条
    const out = microCompact(msgs, { keepFirst: 1, keepRecent: 4 });
    assert.notEqual(out[1]?.role, "tool"); // 保留区首条不是孤立 tool 结果
    const lastMsg = out[out.length - 1];
    assert.ok(lastMsg);
    const lastIdx = msgs.indexOf(lastMsg);
    const prev = msgs[lastIdx - 1];
    if (prev?.role === "assistant" && (prev.tool_calls?.length ?? 0) > 0) {
      assert.equal(lastMsg.role, "tool");
    }
    assert.ok(out.length < msgs.length);
    assert.ok(out.length >= 1 + 4);
  });

  it("对超长单条做字符截断，不破坏其它消息", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "a".repeat(10_000) },
      { role: "user", content: "keep" },
    ];
    const out = microCompact(msgs, { maxMessageChars: 100 });
    const firstOut = out[0];
    const secondOut = out[1];
    assert.ok(firstOut && secondOut);
    assert.ok((firstOut.content as string).includes("(truncated)"));
    assert.equal(secondOut.content, "keep");
  });
});

// --- token budget ---

describe("ContextBudgetImpl", () => {
  it("estimateMessageTokens 按字符/4 估算，含工具参数", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "abcd" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "x", type: "function", function: { name: "f", arguments: "abcd" } }],
      },
    ];
    assert.equal(estimateMessageTokens(msgs), 2); // 8 chars / 4
  });

  it("ratio/level 三档阈值（精确字符控制）", () => {
    const budget = new ContextBudgetImpl({
      contextWindow: 10_000,
      usedInputTokens: 0,
      reserveOutputTokens: 0,
    });
    assert.equal(budget.level(singleCharMessage(4_000)), "ok"); // 0.10
    assert.equal(budget.level(singleCharMessage(24_000)), "warning"); // 0.60
    assert.equal(budget.level(singleCharMessage(34_000)), "auto"); // 0.85
    assert.equal(budget.level(singleCharMessage(39_200)), "blocking"); // 0.98
  });

  it("shouldCompact 在 auto/blocking 触发", () => {
    const budget = new ContextBudgetImpl({
      contextWindow: 10_000,
      usedInputTokens: 0,
      reserveOutputTokens: 0,
    });
    assert.equal(budget.shouldCompact(singleCharMessage(4_000)), false);
    assert.equal(budget.shouldCompact(singleCharMessage(34_000)), true);
  });

  it("已用输入 token 计入占用（低消息量即触发）", () => {
    const budget = new ContextBudgetImpl({
      contextWindow: 10_000,
      usedInputTokens: 9_000,
      reserveOutputTokens: 0,
    });
    assert.equal(budget.shouldCompact(singleCharMessage(4_000)), true);
  });
});

// --- session / full compact ---

describe("sessionCompact / fullCompact", () => {
  const chat: ChatFn = async () => "**summary** of omitted turns";

  it("session 把中段替换为一条 summary", async () => {
    const msgs = makeMessages(40);
    const res = await sessionCompact(msgs, chat, { keepFirst: 1, keepRecent: 12 });
    assert.equal(res.layer, "session");
    assert.equal(res.before, 40);
    assert.equal(res.after, 1 + 1 + 12);
    assert.equal(res.truncated, 40 - (1 + 1 + 12));
    const sessionFirst = res.messages[0];
    const sessionSummary = res.messages[1];
    assert.ok(sessionFirst && sessionSummary);
    assert.ok(sessionFirst.content === "init");
    assert.match(sessionSummary.content as string, /summary of omitted turns/);
  });

  it("full 把除首条外全部替换为一条 summary", async () => {
    const msgs = makeMessages(30);
    const res = await fullCompact(msgs, chat, { keepFirst: 1 });
    assert.equal(res.layer, "full");
    // 首条 + 摘要 + 保留的当前 user 消息
    assert.equal(res.after, 3);
    const fullFirst = res.messages[0];
    assert.ok(fullFirst);
    assert.ok(fullFirst.content === "init");
  });

  it("full 保留当前任务轮：最后一条 user 消息原样在末尾，不进摘要", async () => {
    // 模拟真实场景：历史旧问答 + 当前问题 + 工具轮次
    const msgs: ChatMessage[] = [
      { role: "user", content: "快速介绍一下这个项目" },
      { role: "assistant", content: "旧回答" },
      { role: "user", content: "我发现这个项目不会输出思考过程了，找下原因" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", type: "function", function: { name: "grep", arguments: "{}" } }],
      },
      { role: "tool", content: "grep result", tool_call_id: "c1" },
      { role: "assistant", content: "仍在排查" },
    ];
    const res = await fullCompact(msgs, chat, { keepFirst: 1 });
    // 当前问题及其后的工具轮次整体保留在摘要之后
    const curIdx = res.messages.findIndex(
      (m) => m.role === "user" && m.content === "我发现这个项目不会输出思考过程了，找下原因",
    );
    assert.ok(curIdx > 0, "当前问题应保留");
    assert.equal(res.messages[curIdx - 1]?.content?.startsWith("<session summary"), true);
    // 当前问题不在摘要消息里
    const summaryMsg = res.messages.find((m) => String(m.content).startsWith("<session summary"));
    assert.ok(summaryMsg);
    assert.ok(!String(summaryMsg.content).includes("不会输出思考过程"));
  });

  it("micro 不丢弃当前任务轮：当前问题离尾部很远也保留", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "快速介绍一下这个项目" },
      { role: "assistant", content: "旧回答" },
      { role: "user", content: "我发现这个项目不会输出思考过程了，找下原因" },
    ];
    // 当前问题后跟 30 条工具轮次（远超 keepRecent）
    for (let i = 0; i < 15; i++) {
      msgs.push({
        role: "assistant",
        content: "",
        tool_calls: [
          { id: `c${i}`, type: "function", function: { name: "grep", arguments: "{}" } },
        ],
      });
      msgs.push({ role: "tool", content: `r${i}`, tool_call_id: `c${i}` });
    }
    const out = microCompact(msgs, { keepRecent: 4 });
    const hasCurrent = out.some(
      (m) => m.role === "user" && m.content === "我发现这个项目不会输出思考过程了，找下原因",
    );
    assert.equal(hasCurrent, true);
    assert.ok(out.length < msgs.length, "仍应有中段被丢弃");
  });

  it("session 不丢弃当前任务轮：tail 覆盖最后一条 user 消息", async () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "快速介绍一下这个项目" },
      { role: "assistant", content: "旧回答" },
      { role: "user", content: "我发现这个项目不会输出思考过程了，找下原因" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", type: "function", function: { name: "grep", arguments: "{}" } }],
      },
      { role: "tool", content: "r1", tool_call_id: "c1" },
      { role: "assistant", content: "仍在排查" },
    ];
    const res = await sessionCompact(msgs, chat, { keepRecent: 1 });
    const hasCurrent = res.messages.some(
      (m) => m.role === "user" && m.content === "我发现这个项目不会输出思考过程了，找下原因",
    );
    assert.equal(hasCurrent, true);
  });

  it("均返回新数组，不修改原输入", async () => {
    const msgs = makeMessages(30);
    const snapshot = JSON.stringify(msgs);
    await sessionCompact(msgs, chat);
    await fullCompact(msgs, chat);
    assert.equal(JSON.stringify(msgs), snapshot);
  });
});

// --- session memory service ---

describe("SessionMemoryServiceImpl", () => {
  it("低于 init 阈值时不抽取", () => {
    const repo = fakeRepo();
    const chat = (async () => SECTIONED) as ChatFn;
    const svc = new SessionMemoryServiceImpl({
      chat,
      repo,
      trace,
      contextWindow: 100_000,
      thresholds: { initRatio: 0.5, toolCallMin: 0 },
    });
    const triggered = svc.maybeExtract({
      messages: makeMessages(5),
      cumulativeInputTokens: 100, // < 3000 下限
      toolCallsSinceLastExtract: 0,
      trace,
    });
    assert.equal(triggered, false);
  });

  it("达到 init 阈值后抽取并落盘（fire-and-forget 可被捕获）", async () => {
    const repo = fakeRepo();
    const chat = (async () => SECTIONED) as ChatFn;
    const svc = new SessionMemoryServiceImpl({
      chat,
      repo,
      trace,
      contextWindow: 100_000,
      thresholds: { initRatio: 0.01, toolCallMin: 0, recentWindow: 6 },
    });
    const triggered = svc.maybeExtract({
      messages: makeMessages(5),
      cumulativeInputTokens: 5_000, // >= 3000 下限
      toolCallsSinceLastExtract: 0,
      trace,
    });
    assert.equal(triggered, true);
    await waitFor(async () => (await repo.load("sess-1", "session")) !== null);
    const saved = await repo.load("sess-1", "session");
    assert.ok(saved?.includes("## Session Summary"));
    assert.ok(saved?.includes("- did a thing"));
  });

  it("已有记忆时进入 update 增量合并", async () => {
    const repo = fakeRepo();
    let call = 0;
    const chat = (async () => {
      call++;
      return call === 1 ? SECTIONED : `${SECTIONED}\n## Next Steps\n- updated`;
    }) as ChatFn;
    const svc = new SessionMemoryServiceImpl({
      chat,
      repo,
      trace,
      contextWindow: 100_000,
      thresholds: { initRatio: 0.001, updateRatio: 0.001, toolCallMin: 0, recentWindow: 6 },
    });
    svc.maybeExtract({
      messages: makeMessages(5),
      cumulativeInputTokens: 5_000,
      toolCallsSinceLastExtract: 1,
      trace,
    });
    await waitFor(async () => (await repo.load("sess-1", "session")) !== null);
    svc.maybeExtract({
      messages: makeMessages(5),
      cumulativeInputTokens: 8_000, // 增量 >= 2000 下限
      toolCallsSinceLastExtract: 1,
      trace,
    });
    await waitFor(() => call === 2);
    const saved = await repo.load("sess-1", "session");
    assert.ok(saved?.includes("updated"));
  });

  it("连续失败打开熔断，后续抽取被跳过", async () => {
    const repo = fakeRepo();
    const chat = (async () => {
      throw new Error("boom");
    }) as ChatFn;
    let broken = false;
    const svc = new SessionMemoryServiceImpl({
      chat,
      repo,
      trace,
      contextWindow: 100_000,
      thresholds: { initRatio: 0.001, toolCallMin: 0, maxFailures: 1 },
      onCircuitBroken: () => {
        broken = true;
      },
    });
    svc.maybeExtract({
      messages: makeMessages(5),
      cumulativeInputTokens: 5_000,
      toolCallsSinceLastExtract: 0,
      trace,
    });
    await waitFor(() => broken);
    assert.equal(
      svc.maybeExtract({
        messages: makeMessages(5),
        cumulativeInputTokens: 6_000,
        toolCallsSinceLastExtract: 0,
        trace,
      }),
      false,
    );
  });
});

// --- presentSessionMemory（话题切换防护） ---

describe("presentSessionMemory", () => {
  it("freshUserTurn 剥离 Session Summary，其余章节包装为历史注释", () => {
    const out = presentSessionMemory(SECTIONED, { freshUserTurn: true });
    assert.ok(out.includes("Historical Session Notes"));
    assert.ok(!out.includes("Session Summary"));
    assert.ok(!out.includes("did a thing"));
    assert.ok(out.includes("## Key Decisions"));
    assert.ok(out.includes("- chose X"));
    assert.ok(out.includes("NOT the current task"));
  });

  it("只剩历史摘要章节时返回空串", () => {
    const only = "## Session Summary\n- old stuff";
    assert.equal(presentSessionMemory(only, { freshUserTurn: true }), "");
  });

  it("非 freshUserTurn 原样返回", () => {
    assert.equal(presentSessionMemory(SECTIONED, { freshUserTurn: false }), SECTIONED);
  });

  it("空输入返回空串", () => {
    assert.equal(presentSessionMemory("  ", { freshUserTurn: true }), "");
  });
});

// --- autoCompact orchestrator ---

describe("AutoCompactor", () => {
  const budget = new ContextBudgetImpl({
    contextWindow: 10_000,
    usedInputTokens: 0,
    reserveOutputTokens: 0,
  });

  it("无 chat 时仅 micro 压缩", async () => {
    const ac = new AutoCompactor({ maxFailures: 1 });
    const msgs = bigMessages(200);
    const res = await ac.maybeCompact(msgs, budget);
    assert.ok(res);
    assert.equal(res.layer, "micro");
    assert.notEqual(res.messages, msgs);
  });

  it("有 chat 时排序尝试 session → full 深度压缩", async () => {
    const chat = (async () => "SUMMARY") as ChatFn;
    let deep: string | null = null;
    const ac = new AutoCompactor({
      chat,
      trace,
      maxFailures: 1,
      onCompact: (info) => {
        if (info.layer !== "micro") deep = info.layer;
      },
    });
    const res = await ac.maybeCompact(bigMessages(200), budget);
    assert.ok(res);
    assert.equal(deep, "full");
  });

  it("chat 连续失败后熔断，仅退化到 micro", async () => {
    const chat = (async () => {
      throw new Error("x");
    }) as ChatFn;
    let broken = false;
    const ac = new AutoCompactor({
      chat,
      trace,
      maxFailures: 1,
      onCircuitBroken: () => {
        broken = true;
      },
    });
    const first = await ac.maybeCompact(bigMessages(200), budget);
    assert.ok(first);
    assert.equal(first.layer, "micro");
    await waitFor(() => broken);
    assert.equal(ac.isBreakerOpen, true);
    const second = await ac.maybeCompact(bigMessages(200), budget);
    assert.ok(second);
    assert.equal(second.layer, "micro");
  });

  it("未超预算时返回 null（不压缩）", async () => {
    const ac = new AutoCompactor({});
    assert.equal(await ac.maybeCompact(makeMessages(5), budget), null);
  });
});
