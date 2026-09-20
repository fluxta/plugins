import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SetBrowserSourceUrlEditor } from "./SetBrowserSourceUrlEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <SetBrowserSourceUrlEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
