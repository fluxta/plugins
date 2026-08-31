import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { PluginEditorApp } from "./PluginEditorApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PluginEditorApp />
  </StrictMode>,
);
