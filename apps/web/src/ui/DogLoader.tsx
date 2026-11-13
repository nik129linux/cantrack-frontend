import { MascotSprite } from "../mascot/MascotSprite.js";
import "./dog-loader.css";

export type DogLoaderPose = "run" | "walk" | "wait";

type DogLoaderProps = {
  /** Visible text under the dog; also what screen readers announce. */
  label: string;
  /**
   * What the dog does: `run` for signing in and booting the app, `walk` while
   * a screen loads right after navigating to it, `wait` (tail wag) while one
   * card's data loads. Defaults to `wait`.
   */
  pose?: DogLoaderPose;
};

/**
 * Inline loading state with the Blender mascot (mascot/perrito.blend). It
 * fades in after a short delay, so data that arrives quickly never flashes a
 * dog; the space is reserved from the start, so nothing jumps when it shows.
 */
export function DogLoader({ label, pose = "wait" }: DogLoaderProps) {
  return (
    <div className="dog-loader" role="status" data-pose={pose}>
      <div className="dog-loader__scene" aria-hidden="true">
        {pose === "wait" ? null : (
          <>
            <span className="dog-loader__speed dog-loader__speed--1" />
            <span className="dog-loader__speed dog-loader__speed--2" />
            <span className="dog-loader__speed dog-loader__speed--3" />
            <span className="dog-loader__grass" />
            <span className="dog-loader__ground" />
          </>
        )}
        <MascotSprite pose={pose} size={168} className="dog-loader__dog" />
      </div>
      <p className="dog-loader__label">{label}</p>
    </div>
  );
}
