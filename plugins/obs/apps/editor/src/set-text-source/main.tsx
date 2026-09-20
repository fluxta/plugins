import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SetTextSourceEditor } from "./SetTextSourceEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <SetTextSourceEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
