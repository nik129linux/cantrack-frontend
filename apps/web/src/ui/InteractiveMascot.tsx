import { useRef, type PointerEvent } from "react";
import { ART, type Character } from "../art.js";

export type InteractiveMascotProps = {
  character: Character;
  /** Accessible name when the mascot is a control. Ignored if decorative. */
  label?: string;
  decorative?: boolean;
  size?: number;
  className?: string;
};

/**
 * Pointer-tracking character cut-out. Motion uses CSS variables so hover
 * tracking does not re-render the parent tree.
 */
export function InteractiveMascot({
  character,
  label,
  decorative = false,
  size = 140,
  className,
}: InteractiveMascotProps) {
  const nodeRef = useRef<HTMLElement | null>(null);

  function setNode(node: HTMLElement | null) {
    nodeRef.current = node;
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const node = nodeRef.current;
    if (node === null) {
      return;
    }

    const box = node.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      return;
    }

    const x = ((event.clientX - box.left) / box.width - 0.5) * 18;
    const y = ((event.clientY - box.top) / box.height - 0.5) * 14;
    node.style.setProperty("--mx", `${x.toFixed(1)}px`);
    node.style.setProperty("--my", `${y.toFixed(1)}px`);
  }

  function onPointerLeave() {
    const node = nodeRef.current;
    if (node === null) {
      return;
    }

    node.style.setProperty("--mx", "0px");
    node.style.setProperty("--my", "0px");
  }

  function bounce() {
    const node = nodeRef.current;
    if (node === null) {
      return;
    }

    node.classList.remove("ui-mascot--bounce");
    void node.offsetWidth;
    node.classList.add("ui-mascot--bounce");
  }

  const image = (
    <img
      src={ART[character]}
      alt={decorative ? "" : (label ?? character)}
      width={size}
      height={size}
      draggable={false}
    />
  );

  const classNames = ["ui-mascot", `ui-mascot--${character}`, className]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");

  if (decorative) {
    return (
      <span
        ref={setNode}
        className={classNames}
        aria-hidden="true"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={bounce}
        style={{ width: size, height: size }}
      >
        {image}
      </span>
    );
  }

  return (
    <button
      ref={setNode as (node: HTMLButtonElement | null) => void}
      type="button"
      className={classNames}
      aria-label={label ?? `Play with the ${character}`}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={bounce}
      style={{ width: size, height: size }}
    >
      {image}
    </button>
  );
}
