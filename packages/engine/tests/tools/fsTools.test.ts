/**
 * 文件类工具：读写、按行替换、精确编辑、删除、列目录、grep、glob。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import { deleteFileTool } from "../../src/tools/delete_file/execute";
import { editFileTool } from "../../src/tools/edit_file/execute";
import { grepTool } from "../../src/tools/grep/execute";
import { listDirTool } from "../../src/tools/list_dir/execute";
import { readFileTool } from "../../src/tools/read_file/execute";
import { searchFilesTool } from "../../src/tools/search_files/execute";
import type { ToolContext } from "../../src/tools/types";
import { writeFileTool } from "../../src/tools/write_file/execute";
import { setAllowAiDeleteFiles } from "../../src/workspace";

function ctx(root: string, signal = new AbortController().signal): ToolContext {
  return { workspaceRoot: root, signal };
}

describe("filesystem tools", () => {
  afterEach(() => {
    setAllowAiDeleteFiles(true);
  });

  it("read_file 缺路径、读目录、行区间与超长截断", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tw-read-"));
    fs.mkdirSync(path.join(root, "sub"));
    // "one\ntwo\nthree\n" → 4 行（末尾空行）
    fs.writeFileSync(path.join(root, "a.txt"), "one\ntwo\nthree\n", "utf8");

    await assert.rejects(readFileTool({}, ctx(root)), /requires parameters.path/);
    await assert.rejects(readFileTool({ path: "sub" }, ctx(root)), /Not a file/);
    await assert.rejects(
      readFileTool({ path: "a.txt", start_line: 20, end_line: 30 }, ctx(root)),
      /start_line \(20\) out of bounds/,
    );

    // 猜错路径：ENOENT + 按 basename 给出候选
    fs.mkdirSync(path.join(root, "pkg", "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "pkg", "src", "a.txt"), "nested\n", "utf8");
    await assert.rejects(
      readFileTool({ path: "src/a.txt" }, ctx(root)),
      /File not found: src\/a\.txt[\s\S]*Did you mean:[\s\S]*pkg\/src\/a\.txt/,
    );

    // end 超出总行数时夹到末尾
    const clamped = await readFileTool(
      { path: "a.txt", start_line: 2, end_line: 99 },
      ctx(root),
    );
    assert.match(clamped, /lines\t2-4/);
    assert.match(clamped, /2\|two/);

    // 只给 start → 读到 EOF；只给 end → 从第 1 行起
    const fromStart = await readFileTool({ path: "a.txt", start_line: 3 }, ctx(root));
    assert.match(fromStart, /lines\t3-4/);
    const toEnd = await readFileTool({ path: "a.txt", end_line: 2 }, ctx(root));
    assert.match(toEnd, /lines\t1-2/);

    const ranged = await readFileTool({ path: "a.txt", start_line: 2, end_line: 2 }, ctx(root));
    assert.match(ranged, /lines\t2-2/);
    assert.match(ranged, /2\|two/);

    const clipped = await readFileTool({ path: "a.txt", max_chars: 4 }, ctx(root));
    assert.match(clipped, /truncated\ttrue\tmax_chars\t4/);
    assert.match(clipped, /one\n$/);

    const ac = new AbortController();
    ac.abort();
    await assert.rejects(readFileTool({ path: "a.txt" }, ctx(root, ac.signal)), /cancelled/);
  });

  it("write_file 建父目录、按行替换，区间不能用于新文件", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tw-write-"));
    await assert.rejects(
      writeFileTool({ path: "a.txt" }, ctx(root)),
      /requires parameters.contents/,
    );
    await assert.rejects(
      writeFileTool({ path: "missing.txt", contents: "x", start_line: 1, end_line: 1 }, ctx(root)),
      /requires an existing file/,
    );

    const created = await writeFileTool(
      { path: "nested/a.txt", contents: "alpha\nbeta\n" },
      ctx(root),
    );
    assert.equal(typeof created, "object");
    if (typeof created === "string") return;
    assert.match(created.output, /written\ttrue/);
    assert.match(created.ui?.diff ?? "", /\+alpha/);

    const edited = await writeFileTool(
      { path: "nested/a.txt", contents: "BETA", start_line: 2, end_line: 2 },
      ctx(root),
    );
    if (typeof edited === "string") assert.fail("expected ui result");
    assert.match(edited.output, /lines\t2-2/);
    assert.equal(fs.readFileSync(path.join(root, "nested/a.txt"), "utf8"), "alpha\nBETA\n");

    // end 超出时夹到末尾（当前 3 行：alpha / BETA / 空），从第 2 行替换到 EOF
    const tail = await writeFileTool(
      { path: "nested/a.txt", contents: "TAIL", start_line: 2, end_line: 99 },
      ctx(root),
    );
    if (typeof tail === "string") assert.fail("expected ui result");
    assert.match(tail.output, /lines\t2-3/);
    assert.equal(fs.readFileSync(path.join(root, "nested/a.txt"), "utf8"), "alpha\nTAIL");
  });

  it("edit_file 要求唯一匹配，replace_all 才替换全部", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tw-edit-"));
    fs.writeFileSync(path.join(root, "a.txt"), "foo foo\n", "utf8");
    await assert.rejects(editFileTool({ path: "a.txt" }, ctx(root)), /old_string/);
    await assert.rejects(
      editFileTool({ path: "a.txt", old_string: "foo", new_string: "foo" }, ctx(root)),
      /identical/,
    );
    await assert.rejects(
      editFileTool({ path: "a.txt", old_string: "missing", new_string: "x" }, ctx(root)),
      /not found/,
    );
    await assert.rejects(
      editFileTool({ path: "a.txt", old_string: "foo", new_string: "bar" }, ctx(root)),
      /matched 2 times/,
    );

    const result = await editFileTool(
      { path: "a.txt", old_string: "foo", new_string: "bar", replace_all: "true" },
      ctx(root),
    );
    if (typeof result === "string") assert.fail("expected ui result");
    assert.match(result.output, /replacements\t2/);
    assert.equal(fs.readFileSync(path.join(root, "a.txt"), "utf8"), "bar bar\n");
  });

  it("delete_file 受开关约束，拒绝根目录，目录要 recursive，小文件带回正文", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tw-del-"));
    fs.writeFileSync(path.join(root, "a.txt"), "keep-me", "utf8");
    fs.mkdirSync(path.join(root, "dir"));

    setAllowAiDeleteFiles(false);
    await assert.rejects(deleteFileTool({ path: "a.txt" }, ctx(root)), /disabled in Settings/);
    setAllowAiDeleteFiles(true);

    await assert.rejects(deleteFileTool({ path: "." }, ctx(root)), /workspace root/);
    await assert.rejects(deleteFileTool({ path: "missing.txt" }, ctx(root)), /path not found/);
    await assert.rejects(deleteFileTool({ path: "dir" }, ctx(root)), /recursive=true/);

    const removed = await deleteFileTool({ path: "a.txt" }, ctx(root));
    if (typeof removed === "string") assert.fail("expected ui result");
    assert.match(removed.output, /kind\tfile/);
    assert.equal(removed.ui?.restoreContent, "keep-me");
    assert.equal(fs.existsSync(path.join(root, "a.txt")), false);

    const dirGone = await deleteFileTool({ path: "dir", recursive: true }, ctx(root));
    if (typeof dirGone === "string") assert.fail("expected ui result");
    assert.match(dirGone.output, /kind\tdirectory/);
    assert.equal(dirGone.ui?.restoreContent, undefined);
  });

  it("list_dir 一层列出类型；grep 跳过二进制与 node_modules；search 按文件名", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tw-scan-"));
    fs.mkdirSync(path.join(root, "src"));
    fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "app.ts"), "const token = 1;\n", "utf8");
    fs.writeFileSync(path.join(root, "notes.txt"), "token\0hidden\n", "utf8");
    fs.writeFileSync(path.join(root, "Dockerfile"), "FROM token\n", "utf8");
    fs.writeFileSync(path.join(root, "node_modules", "pkg", "x.ts"), "token\n", "utf8");

    const listed = await listDirTool({ path: "src" }, ctx(root));
    assert.match(listed, /path\tsrc/);
    assert.match(listed, /file\tapp.ts/);

    await assert.rejects(grepTool({ path: "." }, ctx(root)), /requires parameters.pattern/);
    await assert.rejects(grepTool({ pattern: "(" }, ctx(root)), /Invalid regex/);
    const grep = await grepTool({ pattern: "token", path: "." }, ctx(root));
    assert.match(grep, /src\/app.ts:1:/);
    assert.match(grep, /Dockerfile:1:/);
    assert.doesNotMatch(grep, /node_modules|notes.txt/);

    await assert.rejects(searchFilesTool({}, ctx(root)), /requires parameters.pattern/);
    const found = await searchFilesTool({ pattern: "*.ts", path: "." }, ctx(root));
    assert.match(found, /truncated\tfalse/);
    assert.match(found, /src\/app.ts/);
    assert.doesNotMatch(found, /node_modules/);
  });
});
