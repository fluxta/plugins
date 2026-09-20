import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SetMediaSourceFileEditor } from "./SetMediaSourceFileEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <SetMediaSourceFileEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
