/**
 * 探索步骤分组：
 * - 第一次探索工具调用**之前**的 Thought / 叙述：不进 Explored，原样展示
 * - 从第一次探索工具起：之后的探索工具与 Thought 收成一段 Explored
 * - **尾部暂留（加载态）**：还在跑的探索调用、或刚结束不满
 *   `TAIL_MIN_DISPLAY_MS + TAIL_EXIT_ANIM_MS` 的调用，留在组外单独展示（行上带 Running 加载态）；
 *   结束、过最小时长、收起动画播完后自动收进 Explored。暂留期间不出 Planning next move
 * - 与引擎统一：串行工具最小间隔 `toolCallMinGapMs`（默认 850+180+缓冲≈1200ms）≥ 本窗口，
 *   故上一个调用完全收起后下一个才发起，planning/thinking 抑制与卡片收起同步释放
 * - Thought 归属于它**下一次**的工具调用：下一次是非探索类（shell / 改文件等）则单独展示
 * - 只有**一次**探索工具调用时不收组，原样展示工具卡片
 * - 改文件 / 删除单独展示，不进 Explored
 * - 新叙述若出现在已有探索之后：先冲刷 Explored，再展示叙述
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";

/**
 * 尾部探索调用在外的最小展示时长（ms）：再快也让用户看清这张卡。
 * 与引擎 `toolCallMinGapMs`（默认 850+200=1050，见 shared GeneralSettings）统一：
 * 引擎间隔 ≥ 本时长 + 收起动画，故上一卡完全收起后下一个工具才会发起，避免 planning/thinking 提前冒出。
 */
export const TAIL_MIN_DISPLAY_MS = 850;

/**
 * 尾部暂留卡收起（折进 Explored）的退出动画时长（ms），
 * 须与 `styles.less` 中 `run-timeline-tail-exit` 的时长一致。
 * 暂留窗口 = `TAIL_MIN_DISPLAY_MS + TAIL_EXIT_ANIM_MS`：卡片动画播完才放行 planning / 下一调用。
 */
export const TAIL_EXIT_ANIM_MS = 180;

/** 读文件 / 列目录 → files 计数。 */
const FILE_TOOLS = new Set(["read_file", "list_dir"]);
/** 搜索类 → searches 计数。 */
const SEARCH_TOOLS = new Set(["grep", "search_files"]);
/** 浏览器观察类 → pages 计数（进 Explored，可展开截图）。 */
const BROWSER_EXPLORE_TOOLS = new Set([
  "browser_navigate",
  "browser_snapshot",
  "browser_screenshot",
  "browser_scroll",
  "browser_get_styles",
  "browser_resize",
  "browser_lock",
]);

function isExploreTool(name: string): boolean {
  return FILE_TOOLS.has(name) || SEARCH_TOOLS.has(name) || BROWSER_EXPLORE_TOOLS.has(name);
}

export type ExploreGroup = {
  type: "explore";
  id: string;
  steps: ChatTimelineStep[];
  fileCount: number;
  searchCount: number;
  pageCount: number;
  /** 组内仍有工具在跑。 */
  active: boolean;
};

/** 是否为探索类工具（读 / 列 / 搜 / browser 观察）。 */
export function isExploreToolName(name: string): boolean {
  return isExploreTool(name);
}

export type TimelineDisplayItem = { type: "step"; step: ChatTimelineStep } | ExploreGroup;

/** 改文件类工具：进行中显示 edit/write 行，完成后换成 diff 卡片。 */
export function isMutationTool(name: string): boolean {
  return name === "edit_file" || name === "write_file";
}

/** 单独展示、不收进 Explored（改文件 / 删除 / shell / Task）。 */
export function isStandaloneTool(name: string): boolean {
  return (
    isMutationTool(name) ||
    name === "delete_file" ||
    name === "shell" ||
    name === "shell_await" ||
    name === "shell_write" ||
    name === "Task" ||
    name === "task_await" ||
    name === "ask_user"
  );
}

function isCompletedThought(step: ChatTimelineStep): boolean {
  return step.kind === "status" && step.status === "thinking" && !step.active;
}

function isActiveThinking(step: ChatTimelineStep): boolean {
  return step.kind === "status" && step.status === "thinking" && step.active;
}

function isThinkingStep(step: ChatTimelineStep | undefined): boolean {
  return step?.kind === "status" && step.status === "thinking";
}

/** thinking 是否已有实质内容（流式 reasoning 或已完成正文）。 */
function thinkingHasContent(step: ChatTimelineStep | undefined): boolean {
  return isThinkingStep(step) && Boolean((step as { text?: string }).text?.trim());
}

/**
 * 尾部探索调用是否暂留组外（即「进行中」卡片始终展示，直到最短时间 + 收起动画走完）：
 * - 还在跑（phase start + active）：加载态始终留在外面，不论已运行多久
 * - 已结束但不满「最小时长 + 收起动画」（自 startedAt 计）：留在外面凑够，动画播完才收组
 * - 老数据没有 startedAt：不暂留，直接收组
 * 耗时超过窗口的慢工具：加载中一直在外面，一结束立即收组（见相关测试）。
 */
export function tailHoldForTool(step: ChatTimelineStep, now: number): boolean {
  if (step.kind !== "tool") return false;
  if (step.phase === "start" && step.active) return true;
  if (typeof step.startedAt !== "number") return false;
  if (typeof step.endedAt !== "number") return true;
  return now - step.startedAt < TAIL_MIN_DISPLAY_MS + TAIL_EXIT_ANIM_MS;
}

/**
 * 当前是否有暂留组外的探索调用（加载中 / 最小时长内）。
 * 暂留期间不应出现 Planning next move——那张卡本身就是当前活动。
 */
export function hasPendingTailHold(steps: ChatTimelineStep[], now: number = Date.now()): boolean {
  for (const step of steps) {
    if (step.kind !== "tool" || !isExploreTool(step.name)) continue;
    if (tailHoldForTool(step, now)) return true;
  }
  return false;
}

function countExplore(steps: ChatTimelineStep[]): {
  fileCount: number;
  searchCount: number;
  pageCount: number;
  active: boolean;
} {
  let fileCount = 0;
  let searchCount = 0;
  let pageCount = 0;
  let active = false;
  for (const step of steps) {
    if (step.kind !== "tool") continue;
    if (FILE_TOOLS.has(step.name)) fileCount += 1;
    if (SEARCH_TOOLS.has(step.name)) searchCount += 1;
    if (BROWSER_EXPLORE_TOOLS.has(step.name)) pageCount += 1;
    if (step.phase === "start" && step.active) active = true;
  }
  return { fileCount, searchCount, pageCount, active };
}

function pushSteps(items: TimelineDisplayItem[], steps: ChatTimelineStep[]): void {
  for (const step of steps) items.push({ type: "step", step });
}

function pushExplore(items: TimelineDisplayItem[], steps: ChatTimelineStep[]): void {
  if (steps.length === 0) return;
  const exploreCount = steps.filter((s) => s.kind === "tool" && isExploreTool(s.name)).length;
  if (exploreCount < 2) {
    // 没有探索工具，或只有一次探索调用：不收组，原样展示
    pushSteps(items, steps);
    return;
  }
  const { fileCount, searchCount, pageCount, active } = countExplore(steps);
  items.push({
    type: "explore",
    id: `explore:${steps[0]?.id}`,
    steps,
    fileCount,
    searchCount,
    pageCount,
    active,
  });
}

/**
 * 将时间线步序列转为展示项。
 * @param now 当前墙钟（Unix ms）；尾部暂留的最小时长判定用，调用方应按帧刷新
 */
export function groupTimelineForDisplay(
  steps: ChatTimelineStep[],
  now: number = Date.now(),
): TimelineDisplayItem[] {
  const items: TimelineDisplayItem[] = [];
  /**
   * 预计算：每个位置之后最近的工具调用是否为探索类。
   * 用于判断 Thought 的归属——它跟的是下一次工具调用。
   */
  const nextToolIsExplore: boolean[] = new Array(steps.length).fill(false);
  let followingExplore = false;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i] as ChatTimelineStep;
    nextToolIsExplore[i] = followingExplore;
    if (step.kind === "tool") followingExplore = isExploreTool(step.name);
  }
  /**
   * 尾部暂留：加载中 / 刚结束（< 最小时长）的探索调用留在组外，
   * 到点或完成后自动收组。
   */
  const tailHold: boolean[] = steps.map((step) => tailHoldForTool(step, now));
  /** 第一次探索工具之前的 Thought / 叙述。 */
  let preTool: ChatTimelineStep[] = [];
  /** 第一次探索工具及之后的工具 / Thought。 */
  let exploreBuf: ChatTimelineStep[] = [];
  /** 尾部暂留的探索调用（组外展示，到点收组）。 */
  let pendingTail: ChatTimelineStep[] = [];
  let seenExploreTool = false;

  const flushPreTool = () => {
    if (preTool.length === 0) return;
    pushSteps(items, preTool);
    preTool = [];
  };

  const flushExplore = () => {
    if (exploreBuf.length === 0) return;
    pushExplore(items, exploreBuf);
    exploreBuf = [];
  };

  const flushPendingTail = () => {
    if (pendingTail.length === 0) return;
    pushSteps(items, pendingTail);
    pendingTail = [];
  };

  /** 组 → 暂留尾部：任何插到中间的新步骤前先按此时序结算。 */
  const flushTailBoundary = () => {
    flushExplore();
    flushPendingTail();
  };

  /** 仅在有暂留时才冲刷（避免无谓切断正在累积的组）。 */
  const flushTailIfPending = () => {
    if (pendingTail.length === 0) return;
    flushTailBoundary();
  };

  const flushAll = () => {
    flushPreTool();
    flushTailBoundary();
  };

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index] as ChatTimelineStep;
    if (step.kind === "status" && step.status === "planning") {
      flushAll();
      continue;
    }

    if (isActiveThinking(step)) {
      // 暂留期间不出 Planning next move：空思考行整条跳过（到点后自然重现）
      if (pendingTail.length > 0 && !thinkingHasContent(step)) continue;
      flushAll();
      items.push({ type: "step", step });
      continue;
    }

    if (step.kind === "tool" && isStandaloneTool(step.name)) {
      flushAll();
      items.push({ type: "step", step });
      continue;
    }

    // 错误 / 模型切换 / 子代理卡片始终单独展示，不收进 Explored
    if (step.kind === "error" || step.kind === "model_switch" || step.kind === "subagent") {
      flushAll();
      items.push({ type: "step", step });
      continue;
    }

    if (isCompletedThought(step)) {
      // 思考块归属于下一次工具调用：下一次是探索类才收进 Explored，
      // 否则（shell / 改文件等，或后面没有工具了）单独展示
      if (seenExploreTool && nextToolIsExplore[index]) {
        flushTailIfPending();
        exploreBuf.push(step);
      } else {
        flushAll();
        items.push({ type: "step", step });
      }
      continue;
    }

    if (step.kind === "transition") {
      // 承上启下小结：跟随当前段渲染，保证与工具行同列对齐
      if (seenExploreTool) {
        flushTailIfPending();
        exploreBuf.push(step);
      } else {
        preTool.push(step);
      }
      continue;
    }

    if (step.kind === "text") {
      if (seenExploreTool) {
        // 探索段已开始后又来叙述：先收掉 Explored 与暂留尾部，叙述留在外面
        flushTailBoundary();
        items.push({ type: "step", step });
      } else {
        preTool.push(step);
      }
      continue;
    }

    if (step.kind === "tool" && isExploreTool(step.name)) {
      if (!seenExploreTool) {
        // 第一次工具：先吐出工具前的 Thought / 叙述，再开始压缩
        flushPreTool();
        seenExploreTool = true;
      }
      // 尾部调用暂留组外（加载态 / 最小时长）；到点后走收组分支
      if (tailHold[index]) pendingTail.push(step);
      else {
        flushTailIfPending();
        exploreBuf.push(step);
      }
      continue;
    }

    if (step.kind === "tool") {
      if (seenExploreTool) {
        flushTailIfPending();
        exploreBuf.push(step);
      } else {
        flushPreTool();
        items.push({ type: "step", step });
      }
      continue;
    }

    flushAll();
    items.push({ type: "step", step });
  }

  flushAll();
  return items;
}
