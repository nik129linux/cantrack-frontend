import { useState } from "react";

export type AvatarProps = {
  /** Circular avatar image; without it (or if it fails to load) a flat
   *  initials placeholder keeps the same accessible name — no broken images. */
  src?: string;
  alt: string;
  size?: number;
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => (part[0] as string).toUpperCase())
    .join("");
}

/** Circular user/dog avatar with an accessible placeholder fallback. */
export function Avatar({ src, alt, size = 48 }: AvatarProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const style = { width: size, height: size };

  if (src !== undefined && src !== "" && !imageBroken) {
    return (
      <img
        className="ui-avatar"
        src={src}
        alt={alt}
        width={size}
        height={size}
        onError={() => setImageBroken(true)}
      />
    );
  }

  return (
    <span
      className="ui-avatar ui-img-fallback"
      role="img"
      aria-label={alt}
      style={style}
    >
      {initialsOf(alt)}
    </span>
  );
}
