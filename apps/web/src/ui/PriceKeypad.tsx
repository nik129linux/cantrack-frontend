import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatCop } from "../lib/format.js";
import { BackspaceIcon } from "../home/icons.js";
import { Sheet } from "./Sheet.js";
import "./price-keypad.css";

export type PriceKeypadProps = {
  open: boolean;
  title: string;
  value: number;
  min: number;
  max: number;
  /** Prices are typed in multiples of this (the API enforces the same rule). */
  step?: number;
  onConfirm: (value: number) => void;
  onClose: () => void;
};

const MAX_DIGITS = 7;
const LONG_PRESS_MS = 450;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Why an amount cannot be confirmed, or null when it can. */
function problem(amount: number, min: number, max: number, step: number): string | null {
  if (amount < min) return `Mínimo ${formatCop(min)}`;
  if (amount > max) return `Máximo ${formatCop(max)}`;
  if (amount % step !== 0) return `Debe ser múltiplo de ${formatCop(step)}`;
  return null;
}

function Pad({ title, value, min, max, step = 100, onConfirm, onClose }: Omit<PriceKeypadProps, "open">) {
  const [digits, setDigits] = useState(String(Math.max(0, Math.round(value))));
  // The first key replaces the value the pad opened with, like inDrive; Backspace edits it instead.
  const fresh = useRef(true);
  const longPress = useRef<number | null>(null);
  const longPressed = useRef(false);

  const amount = digits === "" ? 0 : Number(digits);
  const issue = problem(amount, min, max, step);
  const touched = !fresh.current;

  function type(chunk: string) {
    const base = fresh.current ? "" : digits;
    fresh.current = false;
    // "000" has nothing to extend on an empty amount; a leading zero never stays.
    if (chunk === "000" && (base === "" || base === "0")) {
      setDigits(base);
      return;
    }
    const joined = `${base}${chunk}`.replace(/^0+(?=\d)/, "");
    if (joined.length <= MAX_DIGITS) setDigits(joined);
    else if (base !== digits) setDigits(base);
  }

  function erase() {
    fresh.current = false;
    setDigits(digits.slice(0, -1));
  }

  function confirm() {
    if (issue === null) onConfirm(amount);
  }

  // The physical keyboard works too (desktop demo). Enter on a focused key is left to that button.
  const latest = useRef({ type, erase, confirm });
  latest.current = { type, erase, confirm };
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^[0-9]$/.test(event.key)) {
        latest.current.type(event.key);
      } else if (event.key === "Backspace") {
        latest.current.erase();
      } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        latest.current.confirm();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function startErase() {
    longPressed.current = false;
    longPress.current = window.setTimeout(() => {
      longPressed.current = true;
      setDigits("");
      fresh.current = false;
    }, LONG_PRESS_MS);
  }

  function stopErase() {
    if (longPress.current !== null) window.clearTimeout(longPress.current);
    longPress.current = null;
  }

  return (
    <Sheet open onClose={onClose} title={title} className="pkeypad">
      <p className="pkeypad__amount" data-testid="keypad-amount" data-empty={amount === 0 ? "" : undefined}>
        {formatCop(amount)}
        <span className="pkeypad__caret" aria-hidden="true" />
      </p>
      <p className="pkeypad__hint" role="status" data-bad={issue !== null && touched ? "" : undefined}>
        {issue !== null && touched ? issue : `Mínimo ${formatCop(min)} · máximo ${formatCop(max)}`}
      </p>
      <div className="pkeypad__grid">
        {DIGITS.map((digit) => (
          <button key={digit} type="button" className="pkeypad__key" onClick={() => type(digit)}>
            {digit}
          </button>
        ))}
        <button type="button" className="pkeypad__key" onClick={() => type("000")}>
          000
        </button>
        <button type="button" className="pkeypad__key" onClick={() => type("0")}>
          0
        </button>
        <button
          type="button"
          className="pkeypad__key"
          aria-label="Borrar"
          onPointerDown={startErase}
          onPointerUp={stopErase}
          onPointerLeave={stopErase}
          onClick={() => {
            if (longPressed.current) {
              longPressed.current = false;
              return;
            }
            erase();
          }}
        >
          <BackspaceIcon />
        </button>
      </div>
      <button type="button" className="pkeypad__done" disabled={issue !== null} onClick={confirm}>
        Listo
      </button>
    </Sheet>
  );
}

/**
 * Number pad (inDrive / Nequi style) to type a price instead of stepping it. Drawn on <body>: a
 * fixed sheet inside a glass card would be clipped by the card's backdrop-filter.
 */
export function PriceKeypad({ open, ...rest }: PriceKeypadProps) {
  return open ? createPortal(<Pad {...rest} />, document.body) : null;
}
