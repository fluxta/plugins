import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { UpdateStreamInfoEditor } from "./UpdateStreamInfoEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <UpdateStreamInfoEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
