import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { StartRecordEditor } from "./StartRecordEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <StartRecordEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
