/**
 * RunTimeline 纯函数（format.ts）。
 */
import assert from "node:assert/strict";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  exploreFileKey,
  formatExploreLabel,
  formatThinkingDuration,
  formatThoughtLabel,
  isSearchToolName,
  pathBasename,
  resolvePathKind,
  shortenAwaitId,
  shouldShowPlanning,
  type Translate,
} from "../../../src/features/chat/RunTimeline/format";
import type { ExploreGroup } from "../../../src/features/chat/timelineExplore";

/** 假翻译：常用键映射为可读文案（含 {n} 占位符语义）。 */
const messages: Record<string, string> = {
  "chat.explored": "EXPLORED",
  "chat.exploring": "EXPLORING",
  "chat.exploreFileOne": "{n} file",
  "chat.exploreFileMany": "{n} files",
  "chat.exploreSearchOne": "{n} search",
  "chat.exploreSearchMany": "{n} searches",
  "chat.explorePageOne": "{n} page",
  "chat.explorePageMany": "{n} pages",
  "chat.exploreJoin": ", ",
  "chat.thoughtBriefly": "Thought briefly",
  "chat.thought": "Thought",
};
const t = ((key: string) => messages[key] ?? key) as Translate;

function group(over: Partial<ExploreGroup>): ExploreGroup {
  return {
    type: "explore",
    id: "g1",
    steps: [],
    fileCount: 0,
    searchCount: 0,
    pageCount: 0,
    active: false,
    ...over,
  };
}

function toolStep(over: Partial<Extract<ChatTimelineStep, { kind: "tool" }>>): ChatTimelineStep {
  return {
    kind: "tool",
    id: "s1",
    name: "read_file",
    phase: "start",
    active: true,
    ...over,
  } as ChatTimelineStep;
}

function statusStep(
  over: Partial<Extract<ChatTimelineStep, { kind: "status" }>>,
): ChatTimelineStep {
  return {
    kind: "status",
    id: "s1",
    status: "thinking",
    active: true,
    ...over,
  } as ChatTimelineStep;
}

describe("pathBasename", () => {
  it("takes last segment with both separators", () => {
    assert.equal(pathBasename("a/b/c.ts"), "c.ts");
    assert.equal(pathBasename("a\\b\\c.ts"), "c.ts");
    assert.equal(pathBasename("a/"), "a/");
  });
});

describe("exploreFileKey", () => {
  it("appends index for uniqueness", () => {
    assert.equal(exploreFileKey("a.ts", 0), "a.ts-0");
    assert.equal(exploreFileKey("a.ts", 2), "a.ts-2");
  });
});

describe("resolvePathKind", () => {
  it("prefers explicit kind", () => {
    assert.equal(resolvePathKind("a.png", "dir"), "dir");
    assert.equal(resolvePathKind("a.ts", "link"), "link");
  });

  it("infers from suffix", () => {
    assert.equal(resolvePathKind("a.png"), "image");
    assert.equal(resolvePathKind("a.jpeg"), "image");
    assert.equal(resolvePathKind("dir/"), "dir");
    assert.equal(resolvePathKind("dir\\"), "dir");
    assert.equal(resolvePathKind("a.ts"), "file");
  });
});

describe("isSearchToolName", () => {
  it("matches search tools only", () => {
    assert.equal(isSearchToolName("grep"), true);
    assert.equal(isSearchToolName("search_files"), true);
    assert.equal(isSearchToolName("read_file"), false);
  });
});

describe("shortenAwaitId", () => {
  it("trims, keeps short ids, ellipsizes long ones", () => {
    assert.equal(shortenAwaitId(""), "");
    assert.equal(shortenAwaitId("  abc  "), "abc");
    assert.equal(shortenAwaitId("12345678901234"), "12345678901234");
    assert.equal(shortenAwaitId("123456789012345"), "1234567890123…");
  });
});

describe("formatThinkingDuration", () => {
  it("formats sub-second, one-decimal and whole seconds", () => {
    assert.equal(formatThinkingDuration(50), "0.1s");
    assert.equal(formatThinkingDuration(1500), "1.5s");
    assert.equal(formatThinkingDuration(2000), "2s");
    assert.equal(formatThinkingDuration(12_345), "12s");
  });
});

describe("formatThoughtLabel", () => {
  it("falls back to briefly for missing / short durations", () => {
    assert.equal(formatThoughtLabel(t, undefined), "Thought briefly");
    assert.equal(formatThoughtLabel(t, 0), "Thought briefly");
    assert.equal(formatThoughtLabel(t, 1400), "Thought briefly");
  });

  it("appends duration past the brief threshold", () => {
    assert.equal(formatThoughtLabel(t, 2000), "Thought 2s");
  });
});

describe("formatExploreLabel", () => {
  it("counts files / searches / pages with join", () => {
    const label = formatExploreLabel(t, group({ fileCount: 2, searchCount: 1, pageCount: 3 }));
    assert.equal(label, "EXPLORED 2 files, 1 search, 3 pages");
  });

  it("uses singular forms and bare verb", () => {
    assert.equal(
      formatExploreLabel(t, group({ fileCount: 1, searchCount: 1, pageCount: 1 })),
      "EXPLORED 1 file, 1 search, 1 page",
    );
    assert.equal(formatExploreLabel(t, group({})), "EXPLORED");
    assert.equal(formatExploreLabel(t, group({ active: true })), "EXPLORING");
  });
});

describe("shouldShowPlanning", () => {
  it("false when not live", () => {
    assert.equal(shouldShowPlanning([], false), false);
  });

  it("false when an active thinking or tool step exists", () => {
    assert.equal(shouldShowPlanning([statusStep({})], true), false);
    assert.equal(shouldShowPlanning([toolStep({})], true), false);
  });

  it("false when the last text step has content", () => {
    const steps: ChatTimelineStep[] = [{ kind: "text", id: "t1", text: "hi" }];
    assert.equal(shouldShowPlanning(steps, true), false);
  });

  it("true when live and idle", () => {
    assert.equal(shouldShowPlanning([], true), true);
  });
});
