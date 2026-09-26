import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { WarnUserEditor } from "./WarnUserEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <WarnUserEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
