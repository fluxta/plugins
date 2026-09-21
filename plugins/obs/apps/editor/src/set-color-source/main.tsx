import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SetColorSourceEditor } from "./SetColorSourceEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <SetColorSourceEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
