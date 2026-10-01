import type { HTMLAttributes } from "react";

export type StatTileTone = "sage" | "peach" | "orange" | "lavender" | "sky" | "butter" | "coral";

export type StatTileProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: string;
  /** Colored tile tone (DESIGN.md stat tiles: size · age · energy). */
  tone?: StatTileTone;
};

/** Small colored tile for one stat (label + value). */
export function StatTile({ label, value, tone = "sage", ...rest }: StatTileProps) {
  return (
    <div className="ui-stat-tile" data-tone={tone} {...rest}>
      <span className="ui-stat-tile__label">{label}</span>
      <strong className="ui-stat-tile__value">{value}</strong>
    </div>
  );
}
