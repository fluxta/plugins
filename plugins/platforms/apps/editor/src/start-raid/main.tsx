import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { StartRaidEditor } from "./StartRaidEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <StartRaidEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
