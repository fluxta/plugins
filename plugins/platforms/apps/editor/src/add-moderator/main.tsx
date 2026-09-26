import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { AddModeratorEditor } from "./AddModeratorEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <AddModeratorEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
