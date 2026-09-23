import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { UntimeoutUserEditor } from "./UntimeoutUserEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <UntimeoutUserEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
