import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { PauseRecordEditor } from "./PauseRecordEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <PauseRecordEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
