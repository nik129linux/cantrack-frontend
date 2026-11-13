import { useWalkerPresence } from "./presence.js";
import "./walker-glass.css";

/** "En línea" / "Desconectado" chip for the walker screens; tapping it opens Inicio. */
export function OnlinePill({ onOpen }: { onOpen: () => void }) {
  const { online } = useWalkerPresence();
  if (online === null) {
    return null;
  }
  return (
    <button
      type="button"
      className="wg__online"
      data-online={online ? "" : undefined}
      onClick={onOpen}
      aria-label={online ? "En línea. Abrir Inicio" : "Desconectado. Abrir Inicio para conectarte"}
    >
      <span className="wg__dot" aria-hidden="true" />
      {online ? "En línea" : "Desconectado"}
    </button>
  );
}
