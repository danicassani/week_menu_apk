import { DeviceTheme } from "./lib/device-theme";
import { PwaUpdates } from "./components/pwa";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DeviceTheme>
      <App />
      <PwaUpdates />
    </DeviceTheme>
  </StrictMode>,
);
