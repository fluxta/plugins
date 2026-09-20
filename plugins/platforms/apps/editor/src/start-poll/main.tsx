import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { StartPollEditor } from "./StartPollEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StartPollEditor />
  </StrictMode>,
);
