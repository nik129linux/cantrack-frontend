import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { CityPreview } from "./city/CityPreview.js";
import { HomeDashboard } from "./home/HomeDashboard.js";
import { GlobalDogLoader } from "./mascot/GlobalDogLoader.js";
import { DeviceChrome } from "./DeviceChrome.js";
import "./phone-frame.css";

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
    <div className="iphone">
      <span className="iphone__button iphone__button--action" />
      <span className="iphone__button iphone__button--up" />
      <span className="iphone__button iphone__button--down" />
      <span className="iphone__button iphone__button--power" />
      <div className="phone-frame">
        <div className="phone-frame__scroll">
          <Root />
        </div>
        {/* The one global mascot: saves, errors and the logout goodbye. */}
        <GlobalDogLoader />
        <DeviceChrome />
      </div>
    </div>
  </StrictMode>,
);
