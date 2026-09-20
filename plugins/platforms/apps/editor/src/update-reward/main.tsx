import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { UpdateRewardEditor } from "./UpdateRewardEditor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UpdateRewardEditor />
  </StrictMode>,
);
