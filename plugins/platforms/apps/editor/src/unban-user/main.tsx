import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { UnbanUserEditor } from "./UnbanUserEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <UnbanUserEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
