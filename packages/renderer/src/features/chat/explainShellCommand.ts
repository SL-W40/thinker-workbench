/**
 * 把待审批的 shell 命令说成人话：先做什么，再做什么。
 * 只解释常见写法；认不出的片段保留原文。
 */
import type { MessageKey } from "../../i18n/translate";

export type ShellClause =
  | { op: "cd"; dir: string }
  | { op: "tsc"; noEmit: boolean; skipLibCheck: boolean }
  | { op: "raw"; text: string };

type Translate = (key: MessageKey, vars?: Record<string, string>) => string;

/** 按 && / || / ; 拆开，引号内的分隔符不算。 */
export function splitShellChain(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? "";
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      if (current.trim()) parts.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    if (ch === ";" || ch === "\n") {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function unquote(token: string): string {
  if (token.length >= 2) {
    const a = token[0];
    const b = token[token.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return token.slice(1, -1);
  }
  return token;
}

function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (const ch of segment) {
    if (quote) {
      current += ch;
      if (ch === quote) {
        quote = null;
        tokens.push(current);
        current = "";
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function baseName(token: string): string {
  const name = unquote(token).split(/[/\\]/).pop() ?? token;
  return name.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
}

function tscIndex(tokens: string[]): number {
  if (tokens.length === 0) return -1;
  if (baseName(tokens[0] ?? "") === "tsc") return 0;
  const launcher = baseName(tokens[0] ?? "");
  if (launcher !== "npx" && launcher !== "pnpm" && launcher !== "npm" && launcher !== "yarn") {
    return -1;
  }
  for (let i = 1; i < tokens.length; i++) {
    const name = baseName(tokens[i] ?? "");
    if (name === "tsc") return i;
  }
  return -1;
}

function parseClause(segment: string): ShellClause {
  const tokens = tokenize(segment);
  if (tokens.length === 0) return { op: "raw", text: segment };
  const base = baseName(tokens[0] ?? "");
  if ((base === "cd" || base === "set-location" || base === "pushd") && tokens.length > 1) {
    return { op: "cd", dir: tokens.slice(1).map(unquote).join(" ") };
  }
  const at = tscIndex(tokens);
  if (at >= 0) {
    const flags = tokens.slice(at + 1).join(" ");
    return {
      op: "tsc",
      noEmit: /(?:^|\s)--noEmit\b/.test(` ${flags}`),
      skipLibCheck: /(?:^|\s)--skipLibCheck\b/.test(` ${flags}`),
    };
  }
  return { op: "raw", text: segment };
}

/** 命令链上的每一步。 */
export function explainShellClauses(command: string): ShellClause[] {
  const segments = splitShellChain(command.trim());
  if (segments.length === 0) return [];
  return segments.map(parseClause);
}

function clauseText(clause: ShellClause, t: Translate): string {
  if (clause.op === "cd") return t("chat.shellPurpose.cd", { dir: clause.dir });
  if (clause.op === "tsc") {
    if (clause.noEmit && clause.skipLibCheck) return t("chat.shellPurpose.tscNoEmitSkipLib");
    if (clause.noEmit) return t("chat.shellPurpose.tscNoEmit");
    if (clause.skipLibCheck) return t("chat.shellPurpose.tscSkipLib");
    return t("chat.shellPurpose.tsc");
  }
  return t("chat.shellPurpose.raw", { command: clause.text });
}

/** 给审批卡用的一整句作用说明。 */
export function formatShellPurpose(command: string, t: Translate): string {
  const clauses = explainShellClauses(command);
  if (clauses.length === 0) return "";
  return (
    clauses.map((clause) => clauseText(clause, t)).join(t("chat.shellPurpose.join")) +
    t("chat.shellPurpose.end")
  );
}
