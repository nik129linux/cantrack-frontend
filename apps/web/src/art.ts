/** Cropped character art from the supplied sprite sheets. */
export const ART = {
  dog: "/art/characters/dog-mascot.png",
  walker: "/art/characters/walker-mascot.png",
  peekingDog: "/art/characters/peeking-dog.png",
} as const;

export type Character = keyof typeof ART;
