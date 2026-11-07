import { PluginEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { PluginEditor } from "./PluginEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PluginEditorProvider>
      <PluginEditor />
    </PluginEditorProvider>
  </StrictMode>,
);
