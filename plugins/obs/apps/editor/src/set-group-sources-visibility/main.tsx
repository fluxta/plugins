import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SetGroupSourcesVisibilityEditor } from "./SetGroupSourcesVisibilityEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <SetGroupSourcesVisibilityEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
