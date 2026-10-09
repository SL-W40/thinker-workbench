/**
 * 按根目录 .gitignore（及 git 已跟踪/未忽略文件）打包项目为 zip。
 *
 * 用法：
 *   node scripts/pack-zip.mjs
 *   node scripts/pack-zip.mjs --out path/to/out.zip
 *
 * 优先 `git ls-files --cached --others --exclude-standard`；
 * 无 git 仓库时回退为遍历文件系统并应用 .gitignore。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @returns {string | null} */
function parseOutArg(argv) {
  const i = argv.indexOf("--out");
  if (i >= 0) {
    const value = argv[i + 1];
    if (!value || value.startsWith("-")) {
      throw new Error("--out 需要目标 zip 路径");
    }
    return path.resolve(value);
  }
  const eq = argv.find((a) => a.startsWith("--out="));
  if (eq) return path.resolve(eq.slice("--out=".length));
  return null;
}

/** @returns {string} */
function defaultOutPath() {
  let version = "0.0.0";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    if (typeof pkg.version === "string" && pkg.version) version = pkg.version;
  } catch {
    /* 无 package.json 时用占位版本 */
  }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const base = path.basename(root);
  return path.join(root, `${base}-${version}-${stamp}.zip`);
}

/** @returns {boolean} */
function isGitRepo() {
  const r = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    encoding: "utf8",
  });
  return r.status === 0 && String(r.stdout).trim() === "true";
}

/**
 * 列出应打进包的相对路径（posix 分隔符）。
 * @returns {string[]}
 */
function listFilesViaGit() {
  const r = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`git ls-files 失败：${r.stderr?.toString() || r.status}`);
  }
  return String(r.stdout)
    .split("\0")
    .map((p) => p.replace(/\\/g, "/"))
    .filter(Boolean)
    .filter((p) => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile());
}

/**
 * 将一条 gitignore glob 转为匹配「相对根目录、正斜杠路径」的正则。
 * @param {string} pattern
 * @returns {{ regex: RegExp, dirOnly: boolean }}
 */
function globToRegex(pattern) {
  let dirOnly = false;
  let p = pattern;
  if (p.endsWith("/")) {
    dirOnly = true;
    p = p.slice(0, -1);
  }
  const anchored = p.includes("/");
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*" && p[i + 1] === "*") {
      re += ".*";
      i++;
      if (p[i + 1] === "/") i++;
      continue;
    }
    if (c === "*") {
      re += "[^/]*";
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      continue;
    }
    if ("+.^$()[]{}|\\".includes(c)) {
      re += `\\${c}`;
      continue;
    }
    re += c;
  }
  const body = anchored ? `^${re}` : `(^|/)${re}`;
  return {
    regex: new RegExp(`${body}(/|$)`),
    dirOnly,
  };
}

/**
 * @param {string[]} lines
 * @returns {{ neg: boolean, dirOnly: boolean, regex: RegExp }[]}
 */
function compileIgnoreRules(lines) {
  /** @type {{ neg: boolean, dirOnly: boolean, regex: RegExp }[]} */
  const rules = [];
  for (const raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let neg = false;
    if (line.startsWith("!")) {
      neg = true;
      line = line.slice(1);
    }
    if (line.startsWith("/")) line = line.slice(1);
    const { regex, dirOnly } = globToRegex(line);
    rules.push({ neg, dirOnly, regex });
  }
  return rules;
}

/**
 * @param {string} relPosix 相对根、正斜杠；目录可带或不带尾 /
 * @param {{ neg: boolean, dirOnly: boolean, regex: RegExp }[]} rules
 * @param {boolean} isDir
 */
function isIgnored(relPosix, rules, isDir) {
  const pathForMatch = relPosix.replace(/\/$/, "");
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (!rule.regex.test(pathForMatch) && !rule.regex.test(`${pathForMatch}/`)) continue;
    ignored = !rule.neg;
  }
  return ignored;
}

/**
 * 无 git 时：读根 .gitignore 并遍历。
 * @returns {string[]}
 */
function listFilesViaWalk() {
  const gitignorePath = path.join(root, ".gitignore");
  const lines = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8").split(/\r?\n/)
    : [];
  const rules = compileIgnoreRules(lines);
  // 始终跳过 VCS 与常见本地目录（即使未写进 .gitignore）
  const hardSkip = compileIgnoreRules([".git/", ".hg/", ".svn/"]);

  /** @type {string[]} */
  const out = [];

  /**
   * @param {string} absDir
   * @param {string} relPosix
   */
  function walk(absDir, relPosix) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const name = ent.name;
      const childRel = relPosix ? `${relPosix}/${name}` : name;
      const childAbs = path.join(absDir, name);
      const dir = ent.isDirectory();
      if (isIgnored(childRel, hardSkip, dir)) continue;
      if (isIgnored(childRel, rules, dir)) continue;
      if (dir) {
        walk(childAbs, childRel);
      } else if (ent.isFile()) {
        out.push(childRel);
      }
    }
  }

  walk(root, "");
  return out;
}

/**
 * @param {string[]} relFiles
 * @param {string} outZip
 */
function createZip(relFiles, outZip) {
  fs.mkdirSync(path.dirname(outZip), { recursive: true });
  if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

  const rootName = path.basename(root);
  const parent = path.dirname(root);
  const listPath = path.join(os.tmpdir(), `tw-pack-${process.pid}.txt`);
  const lines = relFiles.map((f) => `${rootName}/${f}`.replace(/\\/g, "/"));
  fs.writeFileSync(listPath, `${lines.join("\n")}\n`, "utf8");

  try {
    const r = spawnSync("tar", ["-a", "-cf", outZip, "-C", parent, "-T", listPath], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (r.status !== 0) {
      throw new Error(`tar 打包失败（exit ${r.status}）：${r.stderr || r.stdout || ""}`);
    }
  } finally {
    try {
      fs.unlinkSync(listPath);
    } catch {
      /* ignore */
    }
  }
}

function main() {
  const outZip = parseOutArg(process.argv.slice(2)) ?? defaultOutPath();
  const outRel = path.relative(root, outZip).replace(/\\/g, "/");

  const viaGit = isGitRepo();
  let files = viaGit ? listFilesViaGit() : listFilesViaWalk();

  // 不把产物 zip 打进包里
  files = files.filter((f) => {
    if (f === outRel) return false;
    if (f.endsWith(".zip") && path.resolve(root, f) === outZip) return false;
    return true;
  });
  files.sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error("没有可打包的文件");
  }

  createZip(files, outZip);

  const sizeMb = (fs.statSync(outZip).size / (1024 * 1024)).toFixed(2);
  console.log(
    `packed ${files.length} files → ${outZip} (${sizeMb} MiB)${viaGit ? " [git]" : " [.gitignore walk]"}`,
  );
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
