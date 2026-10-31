import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { PlaybackEditor } from "./PlaybackEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <PlaybackEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
