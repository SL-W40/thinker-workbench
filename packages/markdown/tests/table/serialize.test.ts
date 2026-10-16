import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseMarkdown } from "../../src/parse/blocks";
import {
  inlineToPlainText,
  tableToCsv,
  tableToMarkdown,
  tableToMatrix,
  tableToTsv,
} from "../../src/table/serialize";
import type { InlineNode } from "../../src/types";

function text(value: string): InlineNode[] {
  return [{ type: "text", value }];
}

describe("table/serialize", () => {
  it("flattens inline marks to plain text", () => {
    const nodes: InlineNode[] = [
      { type: "strong", children: [{ type: "text", value: "hi" }] },
      { type: "text", value: " " },
      { type: "link", href: "https://x.test", children: [{ type: "text", value: "link" }] },
    ];
    assert.equal(inlineToPlainText(nodes), "hi link");
  });

  it("builds matrix from headers and rows", () => {
    const matrix = tableToMatrix([text("A"), text("B")], [[text("1"), text("2")]]);
    assert.deepEqual(matrix, [
      ["A", "B"],
      ["1", "2"],
    ]);
  });

  it("serializes GFM markdown with alignment", () => {
    const md = tableToMarkdown(
      [text("L"), text("C"), text("R")],
      ["left", "center", "right"],
      [[text("a"), text("b"), text("c")]],
    );
    assert.equal(md, ["| L | C | R |", "| :--- | :---: | ---: |", "| a | b | c |"].join("\n"));
  });

  it("escapes pipes in markdown cells", () => {
    const md = tableToMarkdown([text("a|b")], [null], [[text("1|2")]]);
    assert.equal(md, ["| a\\|b |", "| --- |", "| 1\\|2 |"].join("\n"));
  });

  it("serializes TSV and CSV", () => {
    const headers = [text("name"), text("note")];
    const rows = [[text("x"), text('say "hi", please')]];
    assert.equal(tableToTsv(headers, rows), 'name\tnote\nx\tsay "hi", please');
    assert.equal(tableToCsv(headers, rows), 'name,note\nx,"say ""hi"", please"');
  });

  it("round-trips a parsed table to markdown", () => {
    const blocks = parseMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |");
    assert.equal(blocks[0]?.type, "table");
    if (blocks[0]?.type !== "table") return;
    const out = tableToMarkdown(blocks[0].headers, blocks[0].aligns, blocks[0].rows);
    assert.equal(out, ["| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n"));
  });
});
