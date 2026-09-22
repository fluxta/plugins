import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SetSceneFilterEditor } from "./SetSceneFilterEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <SetSceneFilterEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
