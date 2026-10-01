import type { HTMLAttributes } from "react";

export type CardTint = "surface" | "sage" | "mint" | "peach" | "lavender" | "sky" | "butter";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Pastel background tint; the stylesheet maps it through `data-tint`. */
  tint?: CardTint;
};

/** Surface container with the kit's 28px radius and soft shadow. */
export function Card({ tint = "surface", ...rest }: CardProps) {
  return <div className="ui-card" data-tint={tint} {...rest} />;
}
