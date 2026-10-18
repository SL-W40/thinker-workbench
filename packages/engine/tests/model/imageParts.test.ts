/**
 * 附图 content parts：拼装、路径校验、API 编码。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";
import { setDataDir } from "../../src/config/dataDir";
import { initialState } from "../../src/graph/state";
import {
  buildUserContent,
  contentToPlainText,
  countImageRefs,
  encodeImageRefPart,
  estimateTurnUsage,
  isAllowedChatImagePath,
  messageToApiContent,
} from "../../src/model/imageParts";
import { toApiMessages } from "../../src/model/openai";
import type { ChatMessage } from "../../src/model/types";

describe("imageParts", () => {
  let dataDir: string;
  let imagePath: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-img-"));
    const imagesDir = path.join(dataDir, "workspaces", "ws1", "images");
    fs.mkdirSync(imagesDir, { recursive: true });
    imagePath = path.join(imagesDir, "img1.png");
    // 最小 PNG（1×1）
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    fs.writeFileSync(imagePath, png);
    setDataDir(dataDir);
  });

  afterEach(() => {
    setDataDir(null);
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("buildUserContent：无图返回字符串，有图返回 parts", () => {
    assert.equal(buildUserContent("hello"), "hello");
    const parts = buildUserContent("see", [
      { id: "img1", path: imagePath, mime: "image/png", width: 1, height: 1 },
    ]);
    assert.ok(Array.isArray(parts));
    assert.equal(parts[0]?.type, "text");
    assert.equal(parts[1]?.type, "image_ref");
  });

  it("空正文加图片仍保留 user 轮", () => {
    const state = initialState("", undefined, undefined, [
      { id: "img1", path: imagePath, mime: "image/png", width: 1, height: 1 },
    ]);
    assert.equal(state.messages.length, 1);
    const firstMsg = state.messages[0];
    assert.ok(firstMsg);
    assert.equal(countImageRefs(firstMsg.content), 1);
  });

  it("历史用户附图进入 messages", () => {
    const state = initialState("next", [
      {
        role: "user",
        content: "prev",
        images: [{ id: "img1", path: imagePath, mime: "image/png", width: 1, height: 1 }],
      },
      { role: "assistant", content: "ok" },
    ]);
    assert.equal(state.messages.length, 3);
    const historyFirst = state.messages[0];
    assert.ok(historyFirst);
    assert.equal(countImageRefs(historyFirst.content), 1);
  });

  it("allowed path 与目录外路径", () => {
    assert.equal(isAllowedChatImagePath(imagePath, dataDir), true);
    assert.equal(isAllowedChatImagePath(path.join(dataDir, "other.png"), dataDir), false);
  });

  it("toApiMessages 编码 data URL；缺失文件变文本", () => {
    const msg: ChatMessage = {
      role: "user",
      content: buildUserContent("look", [
        { id: "img1", path: imagePath, mime: "image/png", width: 1, height: 1 },
      ]),
    };
    const api = toApiMessages("sys", [msg]) as Array<{ role: string; content: unknown }>;
    assert.equal(api[0]?.role, "system");
    const content = api[1]?.content as Array<{ type: string; image_url?: { url: string } }>;
    assert.ok(Array.isArray(content));
    const imagePart = content.find((p) => p.type === "image_url");
    assert.ok(imagePart?.image_url?.url.startsWith("data:image/png;base64,"));

    const missing = encodeImageRefPart(
      {
        type: "image_ref",
        id: "x",
        path: path.join(dataDir, "workspaces", "ws1", "images", "gone.png"),
        mime: "image/png",
      },
      dataDir,
    );
    assert.equal(missing.type, "text");
    assert.match(missing.text, /unavailable/);

    const escaped = messageToApiContent(
      {
        role: "user",
        content: [
          { type: "text", text: "x" },
          { type: "image_ref", id: "y", path: "/etc/passwd", mime: "image/png" },
        ],
      },
      dataDir,
    ) as { content: Array<{ type: string; text?: string }> };
    assert.equal(escaped.content[1]?.type, "text");
  });

  it("contentToPlainText 抽出文字", () => {
    const parts = buildUserContent("caption", [
      { id: "img1", path: imagePath, mime: "image/png", width: 1, height: 1 },
    ]);
    assert.equal(contentToPlainText(parts), "caption");
  });

  it("网关没回 usage 时按文本和附图粗估", () => {
    const usage = estimateTurnUsage({
      system: "sys",
      messages: [
        {
          role: "user",
          content: buildUserContent("看图", [
            { id: "img1", path: imagePath, mime: "image/png", width: 1, height: 1 },
          ]),
        },
      ],
      output: "图里是一只猫",
    });
    assert.ok(usage.inputTokens >= 1600);
    assert.ok(usage.outputTokens > 0);
    assert.equal(
      countImageRefs(
        buildUserContent("", [
          { id: "img1", path: imagePath, mime: "image/png", width: 1, height: 1 },
        ]),
      ),
      1,
    );
  });
});
