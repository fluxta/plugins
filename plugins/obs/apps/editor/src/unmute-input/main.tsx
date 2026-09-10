import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { UnmuteInputEditor } from "./UnmuteInputEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UnmuteInputEditor />
  </StrictMode>,
);
