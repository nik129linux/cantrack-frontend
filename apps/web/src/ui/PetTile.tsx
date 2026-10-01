import { useState } from "react";
import type { HTMLAttributes } from "react";
import { HeartIcon, PawIcon } from "./icons.js";

/**
 * The five pet-tile tints, in the rotation order fixed by DESIGN.md.
 * The tile color is picked by hashing the dog id, so it is stable per dog.
 */
const PET_TINTS = ["sage", "peach", "lavender", "sky", "butter"] as const;

/**
 * Stable tint for a dog id: sum of the UTF-16 char codes of the id, mod 5,
 * indexing the rotation above. Pure and deterministic — the same id always
 * gets the same pastel tint. O(n) in the length of the id.
 */
export function petTintFor(id: string): string {
  let sum = 0;
  for (const char of id) {
    sum += char.charCodeAt(0);
  }
  return PET_TINTS[sum % PET_TINTS.length] as string;
}

export type PetTileProps = HTMLAttributes<HTMLDivElement> & {
  dogId: string;
  name: string;
  /** Clay-dog cut-out; until the file exists (or if it fails) a flat
   *  placeholder tile is shown instead — never a broken image. */
  imageSrc?: string;
  distance?: string;
  favorite?: boolean;
  onToggleFavorite?: () => void;
};

/** Square pet card: pastel tint rotated per dog, art, name, distance chip, heart. */
export function PetTile({
  dogId,
  name,
  imageSrc,
  distance,
  favorite = false,
  onToggleFavorite,
  ...rest
}: PetTileProps) {
  const [imageBroken, setImageBroken] = useState(false);

  return (
    <div className="ui-pet-tile" data-tint={petTintFor(dogId)} {...rest}>
      <div className="ui-pet-tile__art">
        {imageSrc !== undefined && imageSrc !== "" && !imageBroken ? (
          <img src={imageSrc} alt={name} onError={() => setImageBroken(true)} />
        ) : (
          <span className="ui-pet-tile__fallback ui-img-fallback" role="img" aria-label={name}>
            <PawIcon />
          </span>
        )}
      </div>
      <p className="ui-pet-tile__name">{name}</p>
      {distance !== undefined && distance !== "" ? (
        <span className="ui-pet-tile__chip">{distance}</span>
      ) : null}
      {onToggleFavorite !== undefined ? (
        <button
          className="ui-pet-tile__heart"
          type="button"
          aria-pressed={favorite}
          aria-label={favorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
          onClick={onToggleFavorite}
        >
          <HeartIcon />
        </button>
      ) : null}
    </div>
  );
}
