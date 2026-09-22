import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { ResolveRedemptionEditor } from "./ResolveRedemptionEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionEditorProvider>
      <ResolveRedemptionEditor />
    </ActionEditorProvider>
  </StrictMode>,
);
