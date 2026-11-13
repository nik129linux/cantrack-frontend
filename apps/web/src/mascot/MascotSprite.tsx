import type { CSSProperties } from "react";
import "./mascot.css";

/**
 * The white dog from mascot/perrito.blend, pre-rendered in Blender: every pose
 * is one horizontal sprite sheet of FRAMES transparent frames, played by a CSS
 * steps() animation. No WebGL and no JS per frame, and every instance shares
 * the same cached image.
 */
export type MascotPose = "run" | "walk" | "wait" | "jump" | "sad" | "bye";

const FRAMES = 24;

const POSES: Record<MascotPose, { ms: number; loop: boolean }> = {
  run: { ms: 620, loop: true },
  walk: { ms: 1000, loop: true },
  wait: { ms: 1600, loop: true },
  jump: { ms: 950, loop: false },
  sad: { ms: 2400, loop: true },
  bye: { ms: 1400, loop: true },
};

export function mascotSheet(pose: MascotPose): string {
  return `/mascot/${pose}.webp`;
}

/** Warm the browser cache so a pose never appears as an empty box. */
export function preloadMascot(poses: MascotPose[]) {
  if (typeof Image === "undefined") {
    return;
  }
  for (const pose of poses) {
    const image = new Image();
    image.decoding = "async";
    image.src = mascotSheet(pose);
  }
}

type MascotSpriteProps = {
  pose: MascotPose;
  /** Rendered width in px; the height follows the 6:5 frame. */
  size?: number;
  className?: string;
};

export function MascotSprite({ pose, size = 120, className }: MascotSpriteProps) {
  const { ms, loop } = POSES[pose];
  const style = {
    "--mascot-sheet": `url("${mascotSheet(pose)}")`,
    "--mascot-frames": FRAMES,
    "--mascot-ms": `${ms}ms`,
    "--mascot-loops": loop ? "infinite" : 1,
    width: size,
    height: Math.round((size * 5) / 6),
  } as CSSProperties;

  return (
    <span
      // A new key restarts the animation from frame 0 when the pose changes.
      key={pose}
      className={className === undefined ? "mascot-sprite" : `mascot-sprite ${className}`}
      data-pose={pose}
      style={style}
      aria-hidden="true"
    />
  );
}
