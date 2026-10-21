import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ART } from "../art.js";
import { playWoof, playTap } from "../lib/sound.js";

export type PeekingDogProps = {
  focusedField?: "email" | "password" | "other" | null;
  hasError?: boolean;
  isSubmitting?: boolean;
  onDogClick?: () => void;
};

const BARK_PHRASES = [
  "¡Guau! 🐾 Bienvenido a CanTrack",
  "¡Listo para salir al parque! 🎾",
  "¡Huelo diversión y nuevos paseos! 🐕",
  "¡Mis amigos ya están en el mapa! 📍",
];

export function PeekingDog({
  focusedField = null,
  hasError = false,
  isSubmitting = false,
  onDogClick,
}: PeekingDogProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [bounced, setBounced] = useState(false);
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const bubbleTimeoutRef = useRef<number | null>(null);

  // Parallax pointer tracking removed per user request
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.style.setProperty("--dog-rot-y", "0deg");
    container.style.setProperty("--dog-rot-x", "0deg");
    container.style.setProperty("--dog-tx", "0px");
    container.style.setProperty("--dog-ty", "0px");
  }, []);

  function handleInteraction() {
    playWoof();
    setBounced(true);
    setTimeout(() => setBounced(false), 600);

    const randomPhrase = BARK_PHRASES[Math.floor(Math.random() * BARK_PHRASES.length)];
    setBubbleText(randomPhrase);

    if (bubbleTimeoutRef.current !== null) {
      window.clearTimeout(bubbleTimeoutRef.current);
    }
    bubbleTimeoutRef.current = window.setTimeout(() => {
      setBubbleText(null);
    }, 2800);

    onDogClick?.();
  }

  // Determine emotional posture
  const isHiding = focusedField === "password";
  const isPerked = focusedField === "email";

  let statusClass = "";
  if (isHiding) statusClass = "peeking-dog--shy";
  else if (isPerked) statusClass = "peeking-dog--perked";
  else if (hasError) statusClass = "peeking-dog--confused";
  else if (isSubmitting) statusClass = "peeking-dog--excited";

  return (
    <div
      ref={containerRef}
      className={`peeking-dog-wrapper ${statusClass} ${bounced ? "peeking-dog--bounce" : ""}`}
      onClick={handleInteraction}
      role="button"
      tabIndex={0}
      aria-label="CanTrack mascot companion. Click to play with the dog!"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleInteraction();
        }
      }}
    >
      {/* Dynamic 3D Speech / Reaction Bubble */}
      {(bubbleText || isHiding) && (
        <div className="peeking-dog__bubble" role="status" aria-live="polite">
          {isHiding && !bubbleText ? (
            <span>🙈 ¡Shh... no estoy mirando!</span>
          ) : (
            <span>{bubbleText}</span>
          )}
        </div>
      )}

      {/* 3D Floating dog stage */}
      <div className="peeking-dog__stage">
        <div className="peeking-dog__aura" aria-hidden="true" />
        <img
          src={ART.peekingDog}
          alt="CanTrack companion dog peeking"
          className="peeking-dog__image"
          draggable={false}
        />
        {/* Playful hint */}
        <span className="peeking-dog__hint" aria-hidden="true">
          🐾 ¡Tócame!
        </span>
      </div>
    </div>
  );
}
