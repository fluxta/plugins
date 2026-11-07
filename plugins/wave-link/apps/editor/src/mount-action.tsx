import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

export function mountAction(editor: ReactNode) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ActionEditorProvider>{editor}</ActionEditorProvider>
    </StrictMode>,
  );
}
