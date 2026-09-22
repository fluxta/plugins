import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { RemoveModeratorEditor } from "./RemoveModeratorEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <RemoveModeratorEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
