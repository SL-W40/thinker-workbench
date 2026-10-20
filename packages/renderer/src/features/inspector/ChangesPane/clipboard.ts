/**
 * 复制相对路径到剪贴板（clipboard API 失败时回退 execCommand）。
 */
export async function copyRelativePath(path: string) {
  try {
    await navigator.clipboard.writeText(path);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = path;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}
