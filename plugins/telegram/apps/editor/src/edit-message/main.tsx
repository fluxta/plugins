import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { EditMessageEditor } from "./EditMessageEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <EditMessageEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
