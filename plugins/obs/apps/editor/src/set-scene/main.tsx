import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SetSceneEditor } from "./SetSceneEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SetSceneEditor />
  </StrictMode>,
);
