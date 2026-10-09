/**
 * 探索步骤分组：
 * - 第一次探索工具调用**之前**的 Thought / 叙述：不进 Explored，原样展示
 * - 从第一次探索工具起：之后的探索工具与 Thought 收成一段 Explored
 * - 改文件 / 删除单独展示，不进 Explored
 * - 新叙述若出现在已有探索之后：先冲刷 Explored，再展示叙述
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";

/** 读文件 / 列目录 → files 计数。 */
const FILE_TOOLS = new Set(["read_file", "list_dir"]);
/** 搜索类 → searches 计数。 */
const SEARCH_TOOLS = new Set(["grep", "search_files"]);

export type ExploreGroup = {
  type: "explore";
  id: string;
  steps: ChatTimelineStep[];
  fileCount: number;
  searchCount: number;
  /** 组内仍有工具在跑。 */
  active: boolean;
};

export type TimelineDisplayItem = { type: "step"; step: ChatTimelineStep } | ExploreGroup;

function isExploreTool(name: string): boolean {
  return FILE_TOOLS.has(name) || SEARCH_TOOLS.has(name);
}

/** 改文件类工具：进行中显示 edit/write 行，完成后换成 diff 卡片。 */
export function isMutationTool(name: string): boolean {
  return name === "edit_file" || name === "write_file";
}

/** 单独展示、不收进 Explored（改文件 / 删除）。 */
export function isStandaloneTool(name: string): boolean {
  return isMutationTool(name) || name === "delete_file";
}

function isCompletedThought(step: ChatTimelineStep): boolean {
  return step.kind === "status" && step.status === "thinking" && !step.active;
}

function isActiveThinking(step: ChatTimelineStep): boolean {
  return step.kind === "status" && step.status === "thinking" && step.active;
}

function countExplore(steps: ChatTimelineStep[]): {
  fileCount: number;
  searchCount: number;
  active: boolean;
} {
  let fileCount = 0;
  let searchCount = 0;
  let active = false;
  for (const step of steps) {
    if (step.kind !== "tool") continue;
    if (FILE_TOOLS.has(step.name)) fileCount += 1;
    if (SEARCH_TOOLS.has(step.name)) searchCount += 1;
    if (step.phase === "start" && step.active) active = true;
  }
  return { fileCount, searchCount, active };
}

function pushSteps(items: TimelineDisplayItem[], steps: ChatTimelineStep[]): void {
  for (const step of steps) items.push({ type: "step", step });
}

function pushExplore(items: TimelineDisplayItem[], steps: ChatTimelineStep[]): void {
  if (steps.length === 0) return;
  const hasExplore = steps.some((s) => s.kind === "tool" && isExploreTool(s.name));
  if (!hasExplore) {
    pushSteps(items, steps);
    return;
  }
  const { fileCount, searchCount, active } = countExplore(steps);
  items.push({
    type: "explore",
    id: `explore:${steps[0]!.id}`,
    steps,
    fileCount,
    searchCount,
    active,
  });
}

/**
 * 将时间线步序列转为展示项。
 */
export function groupTimelineForDisplay(steps: ChatTimelineStep[]): TimelineDisplayItem[] {
  const items: TimelineDisplayItem[] = [];
  /** 第一次探索工具之前的 Thought / 叙述。 */
  let preTool: ChatTimelineStep[] = [];
  /** 第一次探索工具及之后的工具 / Thought。 */
  let exploreBuf: ChatTimelineStep[] = [];
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

  const flushAll = () => {
    flushPreTool();
    flushExplore();
  };

  for (const step of steps) {
    if (step.kind === "status" && step.status === "planning") {
      flushAll();
      continue;
    }

    if (isActiveThinking(step)) {
      flushAll();
      items.push({ type: "step", step });
      continue;
    }

    if (step.kind === "tool" && isStandaloneTool(step.name)) {
      flushAll();
      items.push({ type: "step", step });
      continue;
    }

    // 错误步始终单独展示，不收进 Explored
    if (step.kind === "error") {
      flushAll();
      items.push({ type: "step", step });
      continue;
    }

    if (isCompletedThought(step)) {
      if (seenExploreTool) exploreBuf.push(step);
      else preTool.push(step);
      continue;
    }

    if (step.kind === "text") {
      if (seenExploreTool && exploreBuf.length > 0) {
        // 探索段已开始后又来叙述：先收掉 Explored，叙述留在外面
        flushExplore();
      }
      if (seenExploreTool) {
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
      exploreBuf.push(step);
      continue;
    }

    if (step.kind === "tool") {
      if (seenExploreTool) exploreBuf.push(step);
      else {
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
