import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { DeleteMessageEditor } from "./DeleteMessageEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <DeleteMessageEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
