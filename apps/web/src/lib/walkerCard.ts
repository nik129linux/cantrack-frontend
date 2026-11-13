import type { DogSize } from "./marketplace.js";

/** Labels for what a walker shows owners: the same words on Perfil and on each offer. */
export const DOG_SIZES: { id: DogSize; label: string }[] = [
  { id: "small", label: "Pequeños" },
  { id: "medium", label: "Medianos" },
  { id: "large", label: "Grandes" },
];

export function sizesLabel(sizes: readonly DogSize[] | undefined): string | null {
  if (sizes === undefined || sizes.length === 0) {
    return null;
  }
  if (sizes.length === DOG_SIZES.length) {
    return "Perros de todos los tamaños";
  }
  const words = DOG_SIZES.filter((size) => sizes.includes(size.id)).map((size) => size.label.toLowerCase());
  return `Perros ${words.join(" y ")}`;
}

export function experienceLabel(years: number | null | undefined): string | null {
  if (years === null || years === undefined) {
    return null;
  }
  if (years === 0) {
    return "Menos de 1 año de experiencia";
  }
  return years === 1 ? "1 año de experiencia" : `${years} años de experiencia`;
}

export function walksLabel(walks: number | undefined): string | null {
  if (walks === undefined) {
    return null;
  }
  if (walks === 0) {
    return "Primer paseo en CanTrack";
  }
  return walks === 1 ? "1 paseo hecho" : `${walks} paseos hechos`;
}
