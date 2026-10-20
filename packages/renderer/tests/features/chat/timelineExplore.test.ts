/**
 * 探索分组：工具前的叙述留在外面，探索工具收成一段，改文件单独展示。
 * 尾部暂留（时间驱动）：加载中 / 结束不满 TAIL_MIN_DISPLAY_MS + TAIL_EXIT_ANIM_MS 的探索调用留在组外，
 * 到点自动收组；暂留期间不出 Planning next move。
 */
import assert from "node:assert/strict";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  groupTimelineForDisplay,
  hasPendingTailHold,
  isExploreToolName,
  isMutationTool,
  isStandaloneTool,
  TAIL_EXIT_ANIM_MS,
  TAIL_MIN_DISPLAY_MS,
} from "../../../src/features/chat/timelineExplore";

/** 固定基准时间，避免墙钟漂移影响断言。 */
const T0 = 1_700_000_000_000;

/** 老数据工具步骤（无时间戳）：不暂留，直接收组。 */
function tool(id: string, name: string, active = false): ChatTimelineStep {
  return { id, kind: "tool", name, phase: active ? "start" : "end", active };
}

/** 正在跑的探索调用（加载态）。 */
function runningTool(id: string, name: string, startedAt: number): ChatTimelineStep {
  return { id, kind: "tool", name, phase: "start", active: true, startedAt };
}

/** 已结束的探索调用。 */
function endedTool(id: string, name: string, startedAt: number, endedAt: number): ChatTimelineStep {
  return { id, kind: "tool", name, phase: "end", active: false, startedAt, endedAt };
}

function thought(id: string, text: string, active = false): ChatTimelineStep {
  return { id, kind: "status", status: "thinking", active, ...(text ? { text } : {}) };
}

/** 展示项 id 序列（组 id 自带 explore: 前缀）。 */
function shape(items: ReturnType<typeof groupTimelineForDisplay>): string[] {
  return items.map((item) => (item.type === "step" ? item.step.id : item.id));
}

/** 取出某个 explore 组内的步骤 id。 */
function groupSteps(items: ReturnType<typeof groupTimelineForDisplay>, index: number): string[] {
  const item = items[index];
  if (item?.type !== "explore") assert.fail(`expected explore group at ${index}`);
  return item.steps.map((s) => s.id);
}

describe("timeline explore grouping", () => {
  it("读和搜是探索，改文件和 shell 单独放", () => {
    assert.equal(isExploreToolName("read_file"), true);
    assert.equal(isExploreToolName("browser_screenshot"), true);
    assert.equal(isExploreToolName("shell"), false);
    assert.equal(isMutationTool("write_file"), true);
    assert.equal(isStandaloneTool("Task"), true);
    assert.equal(isStandaloneTool("grep"), false);
  });

  it("第一次探索前的正文不进组；planning 丢掉；一次探索调用不收组", () => {
    const steps: ChatTimelineStep[] = [
      { id: "t0", kind: "text", text: "先看一下" },
      { id: "p", kind: "status", status: "planning", active: true },
      tool("r", "read_file"),
      { id: "w", kind: "tool", name: "write_file", phase: "end", active: false },
      { id: "t1", kind: "text", text: "改完了" },
    ];
    const items = groupTimelineForDisplay(steps, T0);
    assert.deepEqual(shape(items), ["t0", "r", "w", "t1"]);
    assert.equal(
      items.some((item) => item.type === "explore"),
      false,
    );
    assert.equal(
      items.some((item) => item.type === "step" && item.step.id === "p"),
      false,
    );
  });

  it("老数据（无时间戳）不暂留：探索调用直接收组", () => {
    const steps: ChatTimelineStep[] = [
      { id: "t0", kind: "text", text: "先看一下" },
      tool("r1", "read_file"),
      thought("th", "看到了"),
      tool("g", "grep"),
      thought("th2", "搜完了"),
    ];
    const items = groupTimelineForDisplay(steps, T0);
    assert.deepEqual(shape(items), ["t0", "explore:r1", "th2"]);
    assert.deepEqual(groupSteps(items, 1), ["r1", "th", "g"]);
  });

  it("加载中的尾部调用留在组外（带加载态）", () => {
    const steps: ChatTimelineStep[] = [
      tool("r1", "read_file"),
      tool("r2", "list_dir"),
      runningTool("g", "grep", T0 - 400),
    ];
    const items = groupTimelineForDisplay(steps, T0);
    assert.deepEqual(shape(items), ["explore:r1", "g"]);
    assert.deepEqual(groupSteps(items, 0), ["r1", "r2"]);
  });

  it("快速工具至少展示 0.85s：期间不出 Planning next move，到点才收组", () => {
    // 0.2s 就结束了：不到最小时长 → 留组外，空思考行被抑制
    const during: ChatTimelineStep[] = [
      tool("r1", "read_file"),
      tool("r2", "list_dir"),
      endedTool("g", "grep", T0 - 200, T0 - 100),
      thought("th", "", true),
    ];
    const a = groupTimelineForDisplay(during, T0);
    assert.deepEqual(shape(a), ["explore:r1", "g"]);
    assert.deepEqual(groupSteps(a, 0), ["r1", "r2"]);

    // 过了「最小时长 + 收起动画」：收组，空思考行作为 Planning next move 出现
    const after = groupTimelineForDisplay(
      during,
      T0 - 200 + TAIL_MIN_DISPLAY_MS + TAIL_EXIT_ANIM_MS + 10,
    );
    assert.deepEqual(shape(after), ["explore:r1", "th"]);
    assert.deepEqual(groupSteps(after, 0), ["r1", "r2", "g"]);
  });

  it("耗时超过最小时长的工具：加载中在组外，一结束立即收组", () => {
    const loading: ChatTimelineStep[] = [
      tool("r1", "read_file"),
      tool("r2", "list_dir"),
      runningTool("g", "grep", T0 - 3_000),
    ];
    assert.deepEqual(shape(groupTimelineForDisplay(loading, T0)), ["explore:r1", "g"]);

    const done: ChatTimelineStep[] = [
      tool("r1", "read_file"),
      tool("r2", "list_dir"),
      endedTool("g", "grep", T0 - 3_000, T0 - 10),
      thought("th", "", true),
    ];
    const items = groupTimelineForDisplay(done, T0);
    assert.deepEqual(shape(items), ["explore:r1", "th"]);
    assert.deepEqual(groupSteps(items, 0), ["r1", "r2", "g"]);
  });

  it("进行中探索调用在「最短时间+动画时长」前始终暂留：不论已跑多久都展示并压制 planning", () => {
    // 刚开跑：暂留
    const justStarted = [tool("r1", "read_file"), runningTool("g", "grep", T0 - 50)];
    assert.equal(hasPendingTailHold(justStarted, T0), true);
    assert.deepEqual(shape(groupTimelineForDisplay(justStarted, T0)), ["r1", "g"]);

    // 已跑很久（远超窗口）仍在加载：仍暂留，不收组、不冒 planning
    const longLoading = [tool("r1", "read_file"), runningTool("g", "grep", T0 - 5_000)];
    assert.equal(hasPendingTailHold(longLoading, T0), true);
    assert.equal(hasPendingTailHold(longLoading, T0 + 9_999), true);
    assert.deepEqual(shape(groupTimelineForDisplay(longLoading, T0)), ["r1", "g"]);

    // 结束且过了「最小时长 + 收起动画」：收组
    const ended = [tool("r1", "read_file"), endedTool("g", "grep", T0 - 200, T0 - 100)];
    assert.equal(
      hasPendingTailHold(ended, T0 - 100 + TAIL_MIN_DISPLAY_MS + TAIL_EXIT_ANIM_MS + 10),
      false,
    );
  });

  it("暂留期间 thinking 有内容：思考行照常展示（不等收组）", () => {
    const steps: ChatTimelineStep[] = [
      tool("r1", "read_file"),
      tool("r2", "list_dir"),
      endedTool("g", "grep", T0 - 200, T0 - 100),
      thought("th", "搜到了入口", true),
    ];
    const items = groupTimelineForDisplay(steps, T0);
    assert.deepEqual(shape(items), ["explore:r1", "g", "th"]);
    assert.deepEqual(groupSteps(items, 0), ["r1", "r2"]);
  });

  it("暂留尾部之后的工具 / 叙述按时序排在尾部卡后面", () => {
    // 尾部卡还没到点，紧接着来了 shell：组 → 尾部卡 → shell
    const steps: ChatTimelineStep[] = [
      tool("r1", "read_file"),
      tool("r2", "list_dir"),
      endedTool("g", "grep", T0 - 200, T0 - 100),
      { id: "sh", kind: "tool", name: "shell", phase: "end", active: false },
    ];
    const items = groupTimelineForDisplay(steps, T0);
    assert.deepEqual(shape(items), ["explore:r1", "g", "sh"]);
    assert.deepEqual(groupSteps(items, 0), ["r1", "r2"]);
  });

  it("思考的下一次工具是 shell 时不进 Explored，单独展示", () => {
    const steps: ChatTimelineStep[] = [
      tool("r1", "read_file"),
      tool("r2", "list_dir"),
      thought("th", "要跑个命令"),
      { id: "sh", kind: "tool", name: "shell", phase: "end", active: false },
      tool("r3", "read_file"),
      tool("r4", "read_file"),
    ];
    const items = groupTimelineForDisplay(steps, T0);
    assert.deepEqual(shape(items), ["explore:r1", "th", "sh", "explore:r3"]);
    assert.deepEqual(groupSteps(items, 0), ["r1", "r2"]);
    assert.deepEqual(groupSteps(items, 3), ["r3", "r4"]);
  });

  it("思考后面没有工具了：思考单独展示，工具全收组", () => {
    const steps: ChatTimelineStep[] = [
      tool("r1", "read_file"),
      tool("r2", "read_file"),
      thought("th", "先停一下"),
    ];
    const items = groupTimelineForDisplay(steps, T0);
    assert.deepEqual(shape(items), ["explore:r1", "th"]);
    assert.deepEqual(groupSteps(items, 0), ["r1", "r2"]);
  });

  it("暂留期间不出 Planning next move：hasPendingTailHold 覆盖加载中与最小时长", () => {
    // 加载中：暂留 → PlanningRow 应被抑制
    const loading = [tool("r1", "read_file"), runningTool("g", "grep", T0 - 100)];
    assert.equal(hasPendingTailHold(loading, T0), true);

    // 结束但不满 0.85s：仍暂留 → 继续抑制
    const during = [
      tool("r1", "read_file"),
      endedTool("g", "grep", T0 - 200, T0 - 100),
      thought("th", "", true),
    ];
    assert.equal(hasPendingTailHold(during, T0), true);

    // 过「最小时长 + 收起动画」：收组 → 放行 PlanningRow
    assert.equal(
      hasPendingTailHold(during, T0 - 200 + TAIL_MIN_DISPLAY_MS + TAIL_EXIT_ANIM_MS + 10),
      false,
    );

    // 老数据无时间戳：不暂留
    assert.equal(hasPendingTailHold([tool("r1", "read_file")], T0), false);

    // 无探索工具：不暂留
    assert.equal(
      hasPendingTailHold(
        [{ id: "sh", kind: "tool", name: "shell", phase: "end", active: false }],
        T0,
      ),
      false,
    );
  });

  it("探索段之后的小结作为可见独立行，不收进 Explored 组", () => {
    const steps: ChatTimelineStep[] = [
      tool("g1", "grep"),
      tool("r1", "read_file"),
      { id: "tr", kind: "transition", text: "搜索逻辑已确认" },
      tool("g2", "grep"),
      tool("r2", "read_file"),
      thought("th", "确认了"),
    ];
    const items = groupTimelineForDisplay(steps, T0);
    // 小结 tr 在两组探索之间作为可见独立行出现，而非被折进任一 Explored 组
    assert.deepEqual(shape(items), ["explore:g1", "tr", "explore:g2", "th"]);
    assert.deepEqual(groupSteps(items, 0), ["g1", "r1"]);
    assert.deepEqual(groupSteps(items, 2), ["g2", "r2"]);
  });

  it("读文件后出现 [NEXT] 小结再改文件：小结可见、不在折叠组内（复现“几乎不出现”回归）", () => {
    const steps: ChatTimelineStep[] = [
      thought("th0", "先看看实现"),
      tool("r1", "read_file"),
      tool("r2", "read_file"),
      { id: "tr", kind: "transition", text: "定位到问题：入口在 agent.ts" },
      { id: "e1", kind: "tool", name: "edit_file", phase: "end", active: false },
    ];
    const items = groupTimelineForDisplay(steps, T0);
    // 用户可见序列：思考 → 探索组 → 小结 → 改文件
    assert.deepEqual(shape(items), ["th0", "explore:r1", "tr", "e1"]);
    assert.deepEqual(groupSteps(items, 1), ["r1", "r2"]);
    // 小结必须是顶层可见步骤，而非被收进 explore 组的内部步骤
    const visibleTr = items.find(
      (item) => item.type === "step" && item.step.id === "tr",
    );
    assert.ok(visibleTr, "小结 transition 应作为可见独立行出现");
  });

  it("无探索时小结仍作为可见独立行（回归保护）", () => {
    const steps: ChatTimelineStep[] = [
      thought("th0", "想想"),
      { id: "tr", kind: "transition", text: "直接改入口" },
      { id: "e1", kind: "tool", name: "edit_file", phase: "end", active: false },
    ];
    const items = groupTimelineForDisplay(steps, T0);
    assert.deepEqual(shape(items), ["th0", "tr", "e1"]);
  });
});
