import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const result = spawnSync(
  process.execPath,
  [
    "node_modules/@biomejs/biome/bin/biome",
    "check",
    "--max-diagnostics=1000",
    "--reporter=json",
    ".",
  ],
  { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
);

const data = JSON.parse(result.stdout);
writeFileSync(".biome-report.json", JSON.stringify(data, null, 2));

const errors = data.diagnostics.filter((d) => d.severity === "error");
const warnings = data.diagnostics.filter((d) => d.severity === "warning");

console.log(`Total: ${data.summary.errors} errors, ${data.summary.warnings} warnings`);
console.log("\n=== ERRORS ===");
errors.forEach((e, i) => {
  console.log(`${i + 1}. ${e.location.path}:${e.location.start.line}  [${e.category}]`);
  console.log(`   ${e.message.split("\n")[0]}`);
});

console.log("\n=== WARNINGS (by category) ===");
const cats = {};
for (const w of warnings) {
  cats[w.category] = (cats[w.category] || 0) + 1;
}
Object.entries(cats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, count]) => {
    console.log(`  ${count.toString().padStart(3)}  ${cat}`);
  });
