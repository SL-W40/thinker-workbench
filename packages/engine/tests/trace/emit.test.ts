/**
 * Trace emit：并行 Task 的 ALS 隔离与 tool:Task 父挂接。
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  agentEndSpan,
  agentStartSpan,
  configureAgentTrace,
  getActiveAgentTaskId,
  peekAgentSpanId,
  runWithAgentTaskId,
} from "../../src/trace/emit";

type SpanStart = {
  channel: string;
  kind: string;
  phase: string;
  span: {
    id: string;
    parentId?: string;
    taskId?: string;
    name: string;
    attrs?: Record<string, unknown>;
  };
};

const posts: SpanStart[] = [];

function installParentPort(): void {
  const proc = process as NodeJS.Process & {
    parentPort?: {
      postMessage: (message: unknown) => void;
      on: (event: "message", listener: (event: { data: unknown }) => void) => void;
    };
  };
  proc.parentPort = {
    postMessage: (message: unknown) => {
      const m = message as SpanStart;
      if (m && m.kind === "span" && m.phase === "start") posts.push(m);
    },
    on: () => {},
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function startsNamed(name: string): SpanStart[] {
  return posts.filter((p) => p.span.name === name);
}

describe("trace emit parallel Task", () => {
  beforeEach(() => {
    posts.length = 0;
    installParentPort();
    configureAgentTrace({
      enabled: true,
      sessionId: "sess_test",
      runId: `run_${Date.now()}_${Math.random()}`,
      traceId: "tr_test",
      nodeSpanId: "span_graph_tools",
      parentSpanId: "span_bridge",
    });
  });

  afterEach(() => {
    const proc = process as NodeJS.Process & { parentPort?: unknown };
    delete proc.parentPort;
  });

  it("并行 Task：各自 model/tool 带正确 taskId，主会话无 taskId", async () => {
    const graphId = agentStartSpan({
      name: "graph.tools",
      runType: "chain",
      spanId: "span_graph_tools",
    });

    await Promise.all([
      runWithAgentTaskId("task_A", async () => {
        assert.equal(getActiveAgentTaskId(), "task_A");
        const sub = agentStartSpan({
          name: "subagent:explorer",
          runType: "chain",
          taskId: "task_A",
        });
        await sleep(30);
        const model = agentStartSpan({ name: "model.chat", runType: "llm" });
        await sleep(20);
        const tool = agentStartSpan({ name: "tool:read_file", runType: "tool" });
        agentEndSpan(tool);
        agentEndSpan(model);
        agentEndSpan(sub);
      }),
      runWithAgentTaskId("task_B", async () => {
        assert.equal(getActiveAgentTaskId(), "task_B");
        const sub = agentStartSpan({
          name: "subagent:explorer",
          runType: "chain",
          taskId: "task_B",
        });
        await sleep(10);
        const model = agentStartSpan({ name: "model.chat", runType: "llm" });
        await sleep(40);
        const tool = agentStartSpan({ name: "tool:grep", runType: "tool" });
        agentEndSpan(tool);
        agentEndSpan(model);
        agentEndSpan(sub);
      }),
      (async () => {
        await sleep(15);
        assert.equal(getActiveAgentTaskId(), undefined);
        const agent = agentStartSpan({ name: "graph.agent", runType: "chain" });
        agentEndSpan(agent);
      })(),
    ]);

    agentEndSpan(graphId);

    const models = startsNamed("model.chat");
    assert.equal(models.length, 2);
    const taskIds = new Set(models.map((m) => m.span.taskId));
    assert.deepEqual(taskIds, new Set(["task_A", "task_B"]));

    const toolsA = startsNamed("tool:read_file");
    const toolsB = startsNamed("tool:grep");
    assert.equal(toolsA[0]?.span.taskId, "task_A");
    assert.equal(toolsB[0]?.span.taskId, "task_B");

    const graphAgent = startsNamed("graph.agent")[0];
    assert.ok(graphAgent);
    assert.equal(graphAgent.span.taskId, undefined);
  });

  it("并发 tool:Task 都挂到 nodeSpanId，不互相嵌套", async () => {
    await Promise.all([
      (async () => {
        const a = agentStartSpan({
          name: "tool:Task",
          runType: "tool",
          taskId: "task_A",
        });
        await sleep(20);
        agentEndSpan(a);
      })(),
      (async () => {
        const b = agentStartSpan({
          name: "tool:Task",
          runType: "tool",
          taskId: "task_B",
        });
        await sleep(20);
        agentEndSpan(b);
      })(),
    ]);

    const tasks = startsNamed("tool:Task");
    assert.equal(tasks.length, 2);
    for (const t of tasks) {
      assert.equal(t.span.parentId, "span_graph_tools");
    }
    assert.notEqual(tasks[0]?.span.id, tasks[1]?.span.parentId);
    assert.notEqual(tasks[1]?.span.id, tasks[0]?.span.parentId);
  });

  it("task 栈空时 parent 回落到 tool:Task 锚点", async () => {
    const taskSpan = agentStartSpan({
      name: "tool:Task",
      runType: "tool",
      taskId: "task_C",
    });
    agentEndSpan(taskSpan);

    await runWithAgentTaskId("task_C", async () => {
      const sub = agentStartSpan({
        name: "subagent:explorer",
        runType: "chain",
        taskId: "task_C",
      });
      agentEndSpan(sub);
    });

    const sub = startsNamed("subagent:explorer")[0];
    assert.ok(sub);
    assert.equal(sub.span.parentId, taskSpan);
    assert.equal(sub.span.taskId, "task_C");
  });

  it("peekAgentSpanId 跟随栈顶；runtime.run 下挂 graph", () => {
    assert.equal(peekAgentSpanId(), "span_bridge");
    const runId = agentStartSpan({
      name: "runtime.run",
      runType: "chain",
      spanId: "span_runtime_run",
    });
    assert.equal(peekAgentSpanId(), runId);
    const graphId = agentStartSpan({
      name: "graph.agent",
      runType: "chain",
      spanId: "span_graph_agent",
    });
    assert.equal(peekAgentSpanId(), graphId);
    const graph = startsNamed("graph.agent")[0];
    assert.ok(graph);
    assert.equal(graph.span.parentId, runId);
    agentEndSpan(graphId);
    assert.equal(peekAgentSpanId(), runId);
    agentEndSpan(runId);
    assert.equal(peekAgentSpanId(), "span_bridge");
  });

  it("model.candidate 挂在 model.chat 下", () => {
    const chat = agentStartSpan({
      name: "model.chat",
      runType: "llm",
      spanId: "span_model_chat",
    });
    const cand = agentStartSpan({
      name: "model.candidate",
      runType: "llm",
      spanId: "span_model_cand",
      attrs: { modelId: "mdl_x" },
    });
    agentEndSpan(cand);
    agentEndSpan(chat);
    const c = startsNamed("model.candidate")[0];
    assert.ok(c);
    assert.equal(c.span.parentId, chat);
  });

  it("会话标题写入 sessionTitle，不覆盖 Task attrs.title", () => {
    configureAgentTrace({
      enabled: true,
      sessionId: "sess_test",
      runId: `run_title_${Date.now()}`,
      traceId: "tr_test",
      title: "帮我介绍一下这个项目",
      parentSpanId: "span_bridge",
    });
    agentStartSpan({
      name: "tool:Task",
      runType: "tool",
      taskId: "task_t",
      attrs: { title: "Engine 包深度探索", background: true },
    });
    const task = startsNamed("tool:Task")[0];
    assert.ok(task);
    assert.equal(task.span.attrs?.title, "Engine 包深度探索");
    assert.equal(task.span.attrs?.sessionTitle, "帮我介绍一下这个项目");
  });
});
