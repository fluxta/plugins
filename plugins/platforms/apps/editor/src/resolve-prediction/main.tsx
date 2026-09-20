import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { ResolvePredictionEditor } from "./ResolvePredictionEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <ResolvePredictionEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
