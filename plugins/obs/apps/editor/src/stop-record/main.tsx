import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { StopRecordEditor } from "./StopRecordEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <StopRecordEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
