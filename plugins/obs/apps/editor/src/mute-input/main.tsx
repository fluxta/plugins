import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { MuteInputEditor } from "./MuteInputEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <MuteInputEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
