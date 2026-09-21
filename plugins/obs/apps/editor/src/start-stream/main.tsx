import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { StartStreamEditor } from "./StartStreamEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <StartStreamEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
