/**
 * 纯文本复制 / 下载；桌面端优先走 saveTextFile「另存为」。
 */

type SaveTextFileFn = (options: {
  content: string;
  defaultPath?: string;
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}) => Promise<string | null>;

/** 写入剪贴板；失败时回退 execCommand。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 回退到 execCommand */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 浏览器回退：触发下载（无法获知用户是否确认保存）。 */
export function downloadTextFallback(
  text: string,
  filename: string,
  mime = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getSaveTextFile(): SaveTextFileFn | null {
  const api = (
    window as unknown as {
      thinker?: { settings?: { saveTextFile?: SaveTextFileFn } };
    }
  ).thinker?.settings?.saveTextFile;
  return typeof api === "function" ? api : null;
}

/**
 * 桌面端：另存为成功 → `saved`，取消 → `cancelled`。
 * 无 API 时走浏览器下载 → `browser`（无法确认是否保存，不弹成功提示）。
 */
export async function saveOrDownloadText(options: {
  content: string;
  filename: string;
  title: string;
  filters: Array<{ name: string; extensions: string[] }>;
  mime?: string;
}): Promise<"saved" | "cancelled" | "browser"> {
  const save = getSaveTextFile();
  if (save) {
    const saved = await save({
      content: options.content,
      defaultPath: options.filename,
      title: options.title,
      filters: options.filters,
    });
    return saved ? "saved" : "cancelled";
  }
  downloadTextFallback(options.content, options.filename, options.mime);
  return "browser";
}
