/** 工具卡片横向滑动轨道：隐藏滚动条，两端按需渐隐。 */
import { useEffect, useRef, useState } from "react";
import { shortToolLabel, type ToolInfo } from "./drafts";

export function McpToolsRail({ serverId, tools }: { serverId: string; tools: ToolInfo[] }) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [fadeLeft, setFadeLeft] = useState(false);
  const [fadeRight, setFadeRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setFadeLeft(scrollLeft > 2);
      setFadeRight(scrollLeft + clientWidth < scrollWidth - 2);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      className={[
        "mcp-settings__tools-rail",
        fadeLeft ? "is-fade-left" : "",
        fadeRight ? "is-fade-right" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ul ref={scrollerRef} className="mcp-settings__tools">
        {tools.map((tool) => {
          const label = shortToolLabel(tool.name, serverId);
          const desc = tool.description?.trim() || "";
          return (
            <li key={tool.name}>
              <div
                className="mcp-settings__tool"
                title={desc ? `${tool.name}\n${desc}` : tool.name}
              >
                <span className="mcp-settings__tool-name">{label}</span>
                {desc ? <span className="mcp-settings__tool-desc">{desc}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
