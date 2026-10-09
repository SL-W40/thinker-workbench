/**
 * 注入目标页的自动化脚本（snapshot / 交互 / 样式）。
 * 以 IIFE 字符串形式 executeJavaScript，避免打包进页面。
 */

/** 构建可交互节点 snapshot（YAML 风格文本 + ref 表挂到 window）。 */
export const SNAPSHOT_SCRIPT = `(() => {
  const INTERACTIVE = 'a[href],button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[role="checkbox"],[role="radio"],[role="menuitem"],[contenteditable="true"]';
  const nodes = Array.from(document.querySelectorAll(INTERACTIVE));
  const map = new Map();
  const lines = [];
  let i = 0;
  for (const el of nodes) {
    if (!(el instanceof Element)) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const ref = 'e' + (++i);
    map.set(ref, el);
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || tag;
    const name = (
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement
        ? (el.value || el.innerText || el.textContent || '')
        : (el.textContent || '')
      )
    ).trim().replace(/\\s+/g, ' ').slice(0, 80);
    const extra = [];
    if (el instanceof HTMLInputElement) {
      extra.push('type=' + (el.type || 'text'));
      if (el.checked) extra.push('checked');
    }
    if (el instanceof HTMLAnchorElement && el.href) extra.push('href=' + el.href);
    lines.push('- ' + role + ' "' + name.replace(/"/g, "'") + '" [ref=' + ref + ']' + (extra.length ? ' ' + extra.join(' ') : ''));
  }
  window.__twBrowserRefs = map;
  return {
    url: location.href,
    title: document.title,
    yaml: lines.join('\\n') || '(no interactive elements)',
    count: map.size,
  };
})()`;

/** 按 ref 取元素；失败返回 null。 */
function refLookupPreamble(): string {
  return `const map = window.__twBrowserRefs; if (!(map instanceof Map)) throw new Error('No snapshot refs. Call browser_snapshot first.'); const el = map.get(ref); if (!(el instanceof Element)) throw new Error('Unknown ref: ' + ref);`;
}

/** click by ref */
export function clickScript(options: {
  ref: string;
  doubleClick?: boolean;
  button?: string;
}): string {
  const ref = JSON.stringify(options.ref);
  const dbl = options.doubleClick ? "true" : "false";
  const button = JSON.stringify(options.button || "left");
  return `(() => {
    const ref = ${ref};
    ${refLookupPreamble()}
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const type = ${dbl} ? 'dblclick' : 'click';
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: ${button} === 'right' ? 2 : ${button} === 'middle' ? 1 : 0 }));
    if (el instanceof HTMLElement) el.focus();
    if (el instanceof HTMLElement && typeof el.click === 'function' && !${dbl}) el.click();
    return { ok: true, ref };
  })()`;
}

/** type into focused / ref element */
export function typeScript(options: { ref: string; text: string }): string {
  const ref = JSON.stringify(options.ref);
  const text = JSON.stringify(options.text);
  return `(() => {
    const ref = ${ref};
    const text = ${text};
    ${refLookupPreamble()}
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    if (el instanceof HTMLElement) el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + text + el.value.slice(end);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, next); else el.value = next;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el instanceof HTMLElement && el.isContentEditable) {
      document.execCommand('insertText', false, text);
    } else {
      throw new Error('Element is not typeable');
    }
    return { ok: true, ref };
  })()`;
}

/** fill (replace value) */
export function fillScript(options: { ref: string; value: string }): string {
  const ref = JSON.stringify(options.ref);
  const value = JSON.stringify(options.value);
  return `(() => {
    const ref = ${ref};
    const value = ${value};
    ${refLookupPreamble()}
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    if (el instanceof HTMLElement) el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el instanceof HTMLElement && el.isContentEditable) {
      el.textContent = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el instanceof HTMLSelectElement) {
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      throw new Error('Element is not fillable');
    }
    return { ok: true, ref };
  })()`;
}

/** press key */
export function pressKeyScript(options: { key: string; ref?: string }): string {
  const key = JSON.stringify(options.key);
  const ref = options.ref ? JSON.stringify(options.ref) : "null";
  return `(() => {
    const key = ${key};
    const ref = ${ref};
    let target = document.activeElement || document.body;
    if (ref) {
      const map = window.__twBrowserRefs;
      if (!(map instanceof Map)) throw new Error('No snapshot refs.');
      const el = map.get(ref);
      if (!(el instanceof Element)) throw new Error('Unknown ref: ' + ref);
      target = el;
      if (el instanceof HTMLElement) el.focus();
    }
    const opts = { key, code: key, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    target.dispatchEvent(new KeyboardEvent('keypress', opts));
    target.dispatchEvent(new KeyboardEvent('keyup', opts));
    if (key === 'Enter' && target instanceof HTMLFormElement) target.requestSubmit?.();
    return { ok: true, key };
  })()`;
}

/** scroll */
export function scrollScript(options: {
  ref?: string;
  direction?: string;
  amount?: number;
  scrollIntoView?: boolean;
}): string {
  const ref = options.ref ? JSON.stringify(options.ref) : "null";
  const direction = JSON.stringify(options.direction || "down");
  const amount = Number(options.amount ?? 300);
  const intoView = options.scrollIntoView ? "true" : "false";
  return `(() => {
    const ref = ${ref};
    const direction = ${direction};
    const amount = ${amount};
    if (ref) {
      const map = window.__twBrowserRefs;
      if (!(map instanceof Map)) throw new Error('No snapshot refs.');
      const el = map.get(ref);
      if (!(el instanceof Element)) throw new Error('Unknown ref: ' + ref);
      if (${intoView}) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        return { ok: true, scrolledIntoView: true };
      }
      const dx = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
      const dy = direction === 'up' ? -amount : direction === 'down' ? amount : 0;
      el.scrollBy({ left: dx, top: dy, behavior: 'instant' });
      return { ok: true };
    }
    const dx = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
    const dy = direction === 'up' ? -amount : direction === 'down' ? amount : 0;
    window.scrollBy({ left: dx, top: dy, behavior: 'instant' });
    return { ok: true, x: window.scrollX, y: window.scrollY };
  })()`;
}

/** getComputedStyle by ref or selector */
export function getStylesScript(options: {
  ref?: string;
  selector?: string;
  properties?: string[];
}): string {
  const ref = options.ref ? JSON.stringify(options.ref) : "null";
  const selector = options.selector ? JSON.stringify(options.selector) : "null";
  const props = JSON.stringify(options.properties ?? []);
  return `(() => {
    const ref = ${ref};
    const selector = ${selector};
    const props = ${props};
    let el = null;
    if (ref) {
      const map = window.__twBrowserRefs;
      if (!(map instanceof Map)) throw new Error('No snapshot refs.');
      el = map.get(ref);
    } else if (selector) {
      el = document.querySelector(selector);
    } else {
      throw new Error('ref or selector required');
    }
    if (!(el instanceof Element)) throw new Error('Element not found');
    const cs = window.getComputedStyle(el);
    const out = {};
    if (props.length === 0) {
      for (let i = 0; i < cs.length; i++) {
        const name = cs[i];
        out[name] = cs.getPropertyValue(name);
      }
    } else {
      for (const name of props) out[name] = cs.getPropertyValue(name);
    }
    return { tag: el.tagName.toLowerCase(), styles: out };
  })()`;
}
