import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./style.css";
import { startPwa } from "./pwa/client";
import { PwaControls } from "./pwa/PwaControls";
import { startStorageHealth } from "./storage";
import { refreshOffline } from "./offline";
startPwa();
startStorageHealth();
void refreshOffline();
createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <PwaControls />
  </>,
);
