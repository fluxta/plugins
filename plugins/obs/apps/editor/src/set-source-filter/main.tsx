import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { SetSourceFilterEditor } from "./SetSourceFilterEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SetSourceFilterEditor />
  </StrictMode>,
);
