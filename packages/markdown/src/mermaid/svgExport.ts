/**
 * Mermaid SVG → PNG / 下载辅助。
 */

/** 确保 SVG 带 xmlns，否则 Image 解码可能失败。 */
export function ensureSvgXmlns(svg: string): string {
  if (/xmlns\s*=/.test(svg)) return svg;
  return svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
}

function readSvgSize(svg: string): { width: number; height: number } {
  const viewBox = /viewBox\s*=\s*["']([^"']+)["']/i.exec(svg);
  if (viewBox) {
    const parts = (viewBox[1] ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }
  const w = /width\s*=\s*["']([0-9.]+)(?:px)?["']/i.exec(svg);
  const h = /height\s*=\s*["']([0-9.]+)(?:px)?["']/i.exec(svg);
  return {
    width: w ? Number(w[1]) || 800 : 800,
    height: h ? Number(h[1]) || 600 : 600,
  };
}

/** 将 SVG 字符串栅格化为 PNG Blob。 */
export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const xml = ensureSvgXmlns(svg);
  const { width, height } = readSvgSize(xml);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode SVG"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png");
    });
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 触发浏览器下载 Blob。 */
export function downloadBlob(blob: Blob, filename: string): void {
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
