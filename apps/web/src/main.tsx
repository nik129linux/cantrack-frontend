import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { CityPreview } from "./city/CityPreview.js";
import { HomeDashboard } from "./home/HomeDashboard.js";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Unable to mount CanTrack: the root element is missing.");
}

const previewPage = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("preview")
  : null;

function Root() {
  if (previewPage === "city") {
    return <CityPreview />;
  }
  if (previewPage === "home-owner") {
    return <HomeDashboard role="owner" />;
  }
  if (previewPage === "home-walker") {
    return <HomeDashboard role="walker" />;
  }
  return <App />;
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
