/**
 * ask_user 的题目解析与答复排版。
 * 自定义回复非空时作为该题答案，选中的选项仍一并附上。
 */

export type AskUserOption = { id: string; label: string };

export type AskUserQuestion = {
  id: string;
  prompt: string;
  options: AskUserOption[];
};

export type AskUserAnswer = {
  id: string;
  optionId?: string;
  text?: string;
};

const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 5;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseOption(value: unknown, index: number): AskUserOption {
  const row = asRecord(value);
  const label = typeof row?.label === "string" ? row.label.trim() : "";
  if (!label) throw new Error(`options[${index}] requires a non-empty label.`);
  const id = typeof row?.id === "string" && row.id.trim() ? row.id.trim() : `opt_${index + 1}`;
  return { id, label };
}

function parseQuestion(value: unknown, index: number): AskUserQuestion {
  const row = asRecord(value);
  const prompt = typeof row?.prompt === "string" ? row.prompt.trim() : "";
  if (!prompt) throw new Error(`questions[${index}] requires a non-empty prompt.`);
  const id = typeof row?.id === "string" && row.id.trim() ? row.id.trim() : `q${index + 1}`;
  const rawOptions = row?.options;
  if (!Array.isArray(rawOptions) || rawOptions.length < 2 || rawOptions.length > MAX_OPTIONS) {
    throw new Error(`questions[${index}] must have 2–${MAX_OPTIONS} options.`);
  }
  const options = rawOptions.map((opt, i) => parseOption(opt, i));
  const ids = new Set<string>();
  for (const opt of options) {
    if (ids.has(opt.id)) throw new Error(`questions[${index}] has duplicate option id "${opt.id}".`);
    ids.add(opt.id);
  }
  return { id, prompt, options };
}

/** 从工具参数取出 1–4 道题。questions 可以是数组，或 JSON 数组字符串。 */
export function parseAskUserQuestions(args: Record<string, unknown>): AskUserQuestion[] {
  let raw = args.questions;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error("questions is required.");
    try {
      raw = JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error("questions must be a JSON array.");
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("questions must be a non-empty array.");
  }
  if (raw.length > MAX_QUESTIONS) {
    throw new Error(`ask_user accepts at most ${MAX_QUESTIONS} questions.`);
  }
  const questions = raw.map((item, i) => parseQuestion(item, i));
  const ids = new Set<string>();
  for (const q of questions) {
    if (ids.has(q.id)) throw new Error(`Duplicate question id "${q.id}".`);
    ids.add(q.id);
  }
  return questions;
}

function answerRows(value: unknown): AskUserAnswer[] {
  if (!Array.isArray(value)) return [];
  const out: AskUserAnswer[] = [];
  for (const item of value) {
    const row = asRecord(item);
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    const optionId = typeof row?.optionId === "string" ? row.optionId.trim() : "";
    const text = typeof row?.text === "string" ? row.text.trim() : "";
    out.push({
      id,
      ...(optionId ? { optionId } : {}),
      ...(text ? { text } : {}),
    });
  }
  return out;
}

/** 从 HITL values.answers 读答复。每题必须有选项或非空自定义回复。 */
export function parseAskUserAnswers(
  questions: AskUserQuestion[],
  values: Record<string, unknown> | undefined,
): AskUserAnswer[] {
  const byId = new Map(answerRows(values?.answers).map((row) => [row.id, row]));
  return questions.map((q) => {
    const row = byId.get(q.id);
    const option = row?.optionId ? q.options.find((opt) => opt.id === row.optionId) : undefined;
    const text = row?.text?.trim() ?? "";
    if (row?.optionId && !option) {
      throw new Error(`Question "${q.id}" has unknown option "${row.optionId}".`);
    }
    if (!option && !text) {
      throw new Error(`Question "${q.id}" needs a selected option or a custom reply.`);
    }
    return {
      id: q.id,
      ...(option ? { optionId: option.id } : {}),
      ...(text ? { text } : {}),
    };
  });
}

/** 给模型的答复正文。自定义回复非空时写在 answer 行，选项另起一行。 */
export function formatAskUserResult(questions: AskUserQuestion[], answers: AskUserAnswer[]): string {
  const byId = new Map(answers.map((row) => [row.id, row]));
  return questions
    .map((q, index) => {
      const answer = byId.get(q.id);
      const option = answer?.optionId
        ? q.options.find((opt) => opt.id === answer.optionId)
        : undefined;
      const text = answer?.text?.trim() ?? "";
      const lines = [`Q${index + 1}: ${q.prompt}`];
      if (text) {
        lines.push(`answer: ${text}`);
        if (option) lines.push(`option: ${option.label}`);
      } else if (option) {
        lines.push(`answer: ${option.label}`);
      } else {
        lines.push("answer: (none)");
      }
      return lines.join("\n");
    })
    .join("\n\n");
}
