import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SendShoutoutEditor } from "./SendShoutoutEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <SendShoutoutEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
