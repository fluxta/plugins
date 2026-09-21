import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { ResumeRecordEditor } from "./ResumeRecordEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <ResumeRecordEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
