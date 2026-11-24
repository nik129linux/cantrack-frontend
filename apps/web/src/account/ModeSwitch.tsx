import { useState } from "react";
import { setAccountRole, type AccountRole } from "../lib/marketplace.js";
import { supabase } from "../lib/supabase.js";
import { accountError } from "./AccountSettings.js";

/**
 * The big "switch mode" button at the foot of each profile. One email can be
 * owner and walker: the API grants the other role (or switches to it) and the
 * refreshed session swaps the whole app over.
 */
export function ModeSwitch({ role, onSignOut }: { role: AccountRole; onSignOut: () => void }) {
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otherRole: AccountRole = role === "owner" ? "walker" : "owner";

  async function switchRole() {
    setIsSwitching(true);
    setError(null);
    try {
      await setAccountRole(otherRole);
      await supabase.auth.refreshSession();
    } catch (failure: unknown) {
      setError(accountError(failure, "No pudimos cambiar de modo. Inténtalo de nuevo."));
      setIsSwitching(false);
    }
  }

  return (
    <div className="mode-switch">
      <button type="button" className="mode-switch__btn" disabled={isSwitching} onClick={() => void switchRole()}>
        {isSwitching ? "Cambiando…" : otherRole === "walker" ? "Modo paseador" : "Modo dueño"}
      </button>
      <p className="mode-switch__hint">
        {otherRole === "walker"
          ? "Pasea perros con este mismo correo. Tus perros y paseos siguen aquí."
          : "Pide paseos para tu perro con este mismo correo. Tus clientes siguen aquí."}
      </p>
      {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}
      <button type="button" className="mode-switch__logout" onClick={onSignOut}>
        Salir
      </button>
    </div>
  );
}
