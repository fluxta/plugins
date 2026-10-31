import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { RequestSongEditor } from "./RequestSongEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <RequestSongEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
