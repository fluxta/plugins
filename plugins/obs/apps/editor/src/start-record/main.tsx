import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { StartRecordEditor } from "./StartRecordEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StartRecordEditor />
  </StrictMode>,
);
