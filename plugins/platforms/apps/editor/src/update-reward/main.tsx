import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { UpdateRewardEditor } from "./UpdateRewardEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <UpdateRewardEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
