import { useState, type FormEvent } from "react";
import { ApiError } from "../lib/apiError.js";
import {
  changePassword,
  deleteOwnerAccount,
  deleteWalkerAccount,
  downloadExport,
  type AccountRole,
} from "../lib/marketplace.js";
import { supabase } from "../lib/supabase.js";
import { Sheet } from "../ui/Sheet.js";
import "../owner/explore.css";

export function accountError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return error.errorId !== null
        ? `Algo falló de nuestro lado. Código: ${error.errorId}`
        : "Algo falló de nuestro lado.";
    }
    if (error.status === 429) {
      return `Espera ${error.retryAfter ?? "unos"} s antes de intentarlo de nuevo.`;
    }
  }
  return fallback;
}

export type AccountSettingsProps = {
  role: AccountRole;
  userId: string;
  /** Sign out of this device, or of every device. */
  onSignOut: (scope?: "global") => void;
};

/**
 * Data protection and security shared by both profiles (Ley 1581 de 2012):
 * change password, sign out, download my data, delete my account.
 */
export function AccountSettings({ role, userId, onSignOut }: AccountSettingsProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    setIsChanging(true);
    try {
      const result = await changePassword(current, next);
      // Supabase closed every session, this one included: keep this device signed in.
      await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      setCurrent("");
      setNext("");
      setPasswordMessage({ tone: "ok", text: "Contraseña cambiada. Cerramos tu sesión en los otros dispositivos." });
    } catch (failure: unknown) {
      let text = accountError(failure, "No pudimos cambiar la contraseña.");
      if (failure instanceof ApiError && failure.status === 401) {
        text = "La contraseña actual no es correcta.";
      } else if (failure instanceof ApiError && failure.status === 400) {
        text = /different|same|current/i.test(failure.message)
          ? "Usa una contraseña distinta a la actual"
          : /10|characters/i.test(failure.message)
            ? "Usa al menos 10 caracteres (una frase sirve)"
            : /common/i.test(failure.message)
              ? "Esa contraseña es muy común"
              : "No uses tu correo dentro de la contraseña";
      }
      setPasswordMessage({ tone: "error", text });
    } finally {
      setIsChanging(false);
    }
  }

  async function exportData() {
    setExportError(null);
    try {
      const { blob, filename } = await downloadExport(role, userId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (failure: unknown) {
      setExportError(accountError(failure, "No pudimos preparar tus datos."));
    }
  }

  async function deleteAccount() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await (role === "owner" ? deleteOwnerAccount(userId) : deleteWalkerAccount(userId));
      onSignOut();
    } catch (failure: unknown) {
      setDeleteError(
        failure instanceof ApiError && failure.status === 409
          ? "Tienes un paseo en curso. Podrás eliminar la cuenta cuando termine."
          : accountError(failure, "No pudimos eliminar la cuenta."),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <form className="explore__form" onSubmit={(event) => void submitPassword(event)} aria-label="Seguridad">
        <h2 className="explore__section">Seguridad</h2>
        <div className="explore__field">
          <label className="explore__label" htmlFor="pw-current">Contraseña actual</label>
          <input id="pw-current" className="explore__input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="explore__field">
          <label className="explore__label" htmlFor="pw-new">Contraseña nueva</label>
          <input id="pw-new" className="explore__input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          <span className="explore__hint">Tip: una frase larga es más segura que una palabra rara</span>
        </div>
        {passwordMessage !== null ? (
          <p className={passwordMessage.tone === "ok" ? "explore__notice" : "explore__error"} role={passwordMessage.tone === "ok" ? "status" : "alert"}>
            {passwordMessage.text}
          </p>
        ) : null}
        <button type="submit" className="explore__cta" disabled={isChanging || current === "" || next === ""}>
          {isChanging ? "Cambiando…" : "Cambiar contraseña"}
        </button>
        <div className="explore__offer-actions">
          <button type="button" className="explore__small" onClick={() => onSignOut()}>
            Cerrar sesión
          </button>
          <button type="button" className="explore__small" onClick={() => onSignOut("global")}>
            Cerrar sesión en todos los dispositivos
          </button>
        </div>
      </form>

      <section className="explore__form" aria-label="Tus datos">
        <h2 className="explore__section">Tus datos</h2>
        <p className="explore__hint">Ley 1581 de 2012: puedes descargar o borrar tu información.</p>
        <div className="explore__offer-actions">
          <button type="button" className="explore__small explore__small--lime" onClick={() => void exportData()}>
            Descargar mis datos
          </button>
          <button
            type="button"
            className="explore__small explore__small--no"
            onClick={() => {
              setTyped("");
              setDeleteError(null);
              setIsDeleteOpen(true);
            }}
          >
            Eliminar mi cuenta
          </button>
        </div>
        {exportError !== null ? <p className="explore__error" role="alert">{exportError}</p> : null}
      </section>

      <Sheet open={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} title="Eliminar mi cuenta">
        <p>
          Cancelaremos tus paseos abiertos o programados y borraremos tu perfil, tu foto y tu acceso. No se puede deshacer.
        </p>
        <div className="explore__field">
          <label className="explore__label" htmlFor="delete-confirm">Escribe ELIMINAR para confirmar</label>
          <input id="delete-confirm" className="explore__input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        {deleteError !== null ? <p className="explore__error" role="alert">{deleteError}</p> : null}
        <button
          type="button"
          className="explore__cta"
          disabled={typed !== "ELIMINAR" || isDeleting}
          onClick={() => void deleteAccount()}
        >
          {isDeleting ? "Eliminando…" : "Eliminar para siempre"}
        </button>
      </Sheet>
    </>
  );
}
