import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { UpdateChatSettingsEditor } from "./UpdateChatSettingsEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <UpdateChatSettingsEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
