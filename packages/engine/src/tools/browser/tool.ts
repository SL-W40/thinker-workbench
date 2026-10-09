/**
 * 内置浏览器工具规格（对齐 Cursor browser 语义）。
 */
import { defineTool } from "../defineTool";
import {
  browserClickTool,
  browserEvaluateTool,
  browserFillTool,
  browserGetStylesTool,
  browserLockTool,
  browserNavigateTool,
  browserPressKeyTool,
  browserResizeTool,
  browserScreenshotTool,
  browserScrollTool,
  browserSnapshotTool,
  browserTypeTool,
} from "./execute";

export const browserNavigateToolSpec = defineTool({
  name: "browser_navigate",
  description:
    "Navigate the built-in Browser panel (right sidebar) to a URL. Opens/reveals the panel by default. Prefer this over asking the user to open links.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to open." },
      reveal: {
        type: "boolean",
        description:
          "When true (default), show the Browser panel. Set false for background navigation.",
      },
      take_screenshot_afterwards: {
        type: "boolean",
        description: "Capture a screenshot after navigation.",
      },
    },
    required: ["url"],
  },
  execute: browserNavigateTool,
});

export const browserLockToolSpec = defineTool({
  name: "browser_lock",
  description:
    'Lock or unlock the built-in browser for AI control. Use action "lock" before interacting so the user sees an "AI controlling" overlay on hover; "unlock" when done. The user can click Take control to unlock.',
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: 'Must be "lock" or "unlock".',
      },
    },
    required: ["action"],
  },
  execute: browserLockTool,
});

export const browserSnapshotToolSpec = defineTool({
  name: "browser_snapshot",
  description:
    "Capture an accessibility-style snapshot of interactive elements with opaque refs (e1, e2, …). Call before click/type/fill. Refs are invalidated after navigation.",
  parameters: {
    type: "object",
    properties: {
      take_screenshot_afterwards: {
        type: "boolean",
        description: "Also capture a screenshot.",
      },
    },
    required: [],
  },
  execute: browserSnapshotTool,
});

export const browserClickToolSpec = defineTool({
  name: "browser_click",
  description: "Click an element by ref from browser_snapshot.",
  parameters: {
    type: "object",
    properties: {
      ref: { type: "string", description: "Element ref from browser_snapshot." },
      element: {
        type: "string",
        description: "Human-readable description of the element.",
      },
      double_click: {
        type: "boolean",
        description: "Double-click when true.",
      },
      button: {
        type: "string",
        description: 'Mouse button: "left" (default), "right", or "middle".',
      },
      take_screenshot_afterwards: {
        type: "boolean",
        description: "Capture a screenshot after the click.",
      },
    },
    required: ["ref"],
  },
  execute: browserClickTool,
});

export const browserTypeToolSpec = defineTool({
  name: "browser_type",
  description:
    "Type text into an input/textarea/contenteditable by ref (appends at caret).",
  parameters: {
    type: "object",
    properties: {
      ref: { type: "string", description: "Element ref from browser_snapshot." },
      text: { type: "string", description: "Text to type." },
      element: {
        type: "string",
        description: "Human-readable description of the element.",
      },
      take_screenshot_afterwards: {
        type: "boolean",
        description: "Capture a screenshot afterwards.",
      },
    },
    required: ["ref", "text"],
  },
  execute: browserTypeTool,
});

export const browserFillToolSpec = defineTool({
  name: "browser_fill",
  description:
    "Replace the value of an input/textarea/select/contenteditable by ref.",
  parameters: {
    type: "object",
    properties: {
      ref: { type: "string", description: "Element ref from browser_snapshot." },
      value: { type: "string", description: "Value to set." },
      element: {
        type: "string",
        description: "Human-readable description of the element.",
      },
      take_screenshot_afterwards: {
        type: "boolean",
        description: "Capture a screenshot afterwards.",
      },
    },
    required: ["ref", "value"],
  },
  execute: browserFillTool,
});

export const browserPressKeyToolSpec = defineTool({
  name: "browser_press_key",
  description:
    "Press a key (Enter, Escape, Tab, ArrowDown, or a character) in the page.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Key name or character." },
      ref: {
        type: "string",
        description: "Optional focus target ref from browser_snapshot.",
      },
      take_screenshot_afterwards: {
        type: "boolean",
        description: "Capture a screenshot afterwards.",
      },
    },
    required: ["key"],
  },
  execute: browserPressKeyTool,
});

export const browserScrollToolSpec = defineTool({
  name: "browser_scroll",
  description: "Scroll the page or an element; or scroll a ref into view.",
  parameters: {
    type: "object",
    properties: {
      ref: {
        type: "string",
        description: "Optional element ref from browser_snapshot.",
      },
      direction: {
        type: "string",
        description: 'Scroll direction: "up", "down", "left", or "right".',
      },
      amount: {
        type: "number",
        description: "Pixels to scroll (default 300).",
      },
      scroll_into_view: {
        type: "boolean",
        description: "When true with ref, scroll that element into view.",
      },
      take_screenshot_afterwards: {
        type: "boolean",
        description: "Capture a screenshot afterwards.",
      },
    },
    required: [],
  },
  execute: browserScrollTool,
});

export const browserEvaluateToolSpec = defineTool({
  name: "browser_evaluate",
  description:
    "Execute JavaScript in the page context and return a JSON-serializable result. Prefer dedicated tools for clicks/typing.",
  parameters: {
    type: "object",
    properties: {
      script: {
        type: "string",
        description: "JS expression or IIFE to evaluate in the page.",
      },
      take_screenshot_afterwards: {
        type: "boolean",
        description: "Capture a screenshot afterwards.",
      },
    },
    required: ["script"],
  },
  execute: browserEvaluateTool,
});

export const browserResizeToolSpec = defineTool({
  name: "browser_resize",
  description:
    "Set the browser viewport size (CSS pixels) via device metrics emulation.",
  parameters: {
    type: "object",
    properties: {
      width: { type: "number", description: "Viewport width in CSS pixels." },
      height: { type: "number", description: "Viewport height in CSS pixels." },
    },
    required: ["width", "height"],
  },
  execute: browserResizeTool,
});

export const browserGetStylesToolSpec = defineTool({
  name: "browser_get_styles",
  description:
    "Query computed CSS styles for an element by snapshot ref or CSS selector. Optionally pass properties as a comma-separated list to limit keys.",
  parameters: {
    type: "object",
    properties: {
      ref: {
        type: "string",
        description: "Element ref from browser_snapshot.",
      },
      selector: {
        type: "string",
        description: "CSS selector (used when ref is omitted).",
      },
      properties: {
        type: "string",
        description:
          'Comma-separated CSS property names (e.g. "color,display,font-size"). Omit for all.',
      },
    },
    required: [],
  },
  execute: browserGetStylesTool,
});

export const browserScreenshotToolSpec = defineTool({
  name: "browser_screenshot",
  description:
    "Capture a PNG screenshot of the browser viewport; returns a local file path.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: browserScreenshotTool,
});
