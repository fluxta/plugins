import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { ResolvePredictionEditor } from "./ResolvePredictionEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ResolvePredictionEditor />
  </StrictMode>,
);
