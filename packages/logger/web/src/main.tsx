/**
 * 日志查看器独立入口。
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyDesignTheme, disableTabFocusNav } from "@thinker-workbench/design";
import { ThemeProvider } from "@thinker-workbench/design/react";
import "@thinker-workbench/design/styles.less";
import "@thinker-workbench/design/controls.less";
import { App } from "./App";
import { readBootAppearance } from "./boot";
import "./styles.less";

disableTabFocusNav();

const boot = readBootAppearance();
applyDesignTheme(boot.theme);

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider theme={boot.theme}>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
