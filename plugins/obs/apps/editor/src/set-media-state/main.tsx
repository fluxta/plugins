import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SetMediaStateEditor } from "./SetMediaStateEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <SetMediaStateEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
