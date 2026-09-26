import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { TimeoutUserEditor } from "./TimeoutUserEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <TimeoutUserEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
