import { PwaUpdates } from "./components/pwa";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <PwaUpdates />
  </StrictMode>,
);
