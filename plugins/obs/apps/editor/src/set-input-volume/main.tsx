import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SetInputVolumeEditor } from "./SetInputVolumeEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SetInputVolumeEditor />
  </StrictMode>,
);
