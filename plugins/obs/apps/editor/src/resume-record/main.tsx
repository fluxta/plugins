import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { ResumeRecordEditor } from "./ResumeRecordEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ResumeRecordEditor />
  </StrictMode>,
);
