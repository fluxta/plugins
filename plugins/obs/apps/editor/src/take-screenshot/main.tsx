import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { TakeScreenshotEditor } from "./TakeScreenshotEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <TakeScreenshotEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
