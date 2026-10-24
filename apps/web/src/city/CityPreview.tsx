import { CityScene } from "./CityScene.js";
import "../auth/auth.css";

/** Development-only page (`?preview=city`) to see the animated city on its own. */
export function CityPreview() {
  return (
    <div className="auth-scene">
      <div className="auth-backdrop" aria-hidden="true">
        <div className="auth-backdrop__clouds auth-backdrop__clouds--left" />
        <div className="auth-backdrop__clouds auth-backdrop__clouds--right" />
      </div>
      <div style={{ position: "relative", display: "grid", placeItems: "center", minHeight: "100dvh", padding: 16 }}>
        <div style={{ width: "min(100%, 980px)" }}>
          <CityScene />
        </div>
      </div>
    </div>
  );
}
