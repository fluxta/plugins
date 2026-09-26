import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { RunCommercialEditor } from "./RunCommercialEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <RunCommercialEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
