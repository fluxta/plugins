import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SetSourceVisibilityEditor } from "./SetSourceVisibilityEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SetSourceVisibilityEditor />
  </StrictMode>,
);
