/**
 * 历史转 agent：附图引用保留。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createMessage, toAgentHistory } from "../../../src/features/chat/message/messageModel";

describe("toAgentHistory images", () => {
  it("带上用户附图引用", () => {
    const images = [
      {
        id: "img1",
        path: "/data/workspaces/w/images/img1.png",
        mime: "image/png",
        width: 10,
        height: 10,
      },
    ];
    const history = toAgentHistory([
      createMessage("user", "see this", false, undefined, images),
      createMessage("assistant", "ok"),
    ]);
    assert.equal(history.length, 2);
    assert.equal(history[0]?.role, "user");
    assert.deepEqual(history[0]?.images, images);
  });

  it("仅图片也能形成用户消息", () => {
    const images = [
      {
        id: "img1",
        path: "/data/workspaces/w/images/img1.png",
        mime: "image/png",
        width: 1,
        height: 1,
      },
      {
        id: "img2",
        path: "/data/workspaces/w/images/img2.png",
        mime: "image/png",
        width: 2,
        height: 2,
      },
    ];
    const msg = createMessage("user", "", false, undefined, images);
    assert.equal(msg.images?.length, 2);
    const history = toAgentHistory([msg]);
    assert.equal(history.length, 1);
    assert.equal(history[0]?.content, "");
    assert.equal(history[0]?.images?.length, 2);
  });
});
