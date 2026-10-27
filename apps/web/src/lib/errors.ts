/** Spanish messages for API and network errors shown in the glass screens. */

const KNOWN_ERRORS: ReadonlyArray<readonly [RegExp, string]> = [
  [/failed to fetch|networkerror|load failed/i, "No pudimos conectar con el servidor. Revisa que la API esté encendida."],
  [/bearer token is required|invalid authentication token/i, "Tu sesión venció. Vuelve a ingresar."],
  [/This offer is no longer available/i, "Otro cuidador ya tomó esta oferta o el dueño la canceló."],
  [/Create your walker profile before accepting/i, "Crea tu perfil de cuidador antes de aceptar ofertas."],
  [/This dog already has an active request for that time/i, "Ese perro ya tiene un paseo a esa hora."],
  [/Too many pending requests/i, "Tienes demasiadas ofertas pendientes. Cancela alguna primero."],
  [/requestedTime must be in the future/i, "La hora del paseo debe ser en el futuro."],
  [/requestedTime must be an ISO-8601/i, "La fecha y la hora no son válidas."],
  [/must be higher than the current one/i, "El nuevo precio debe ser mayor que el actual."],
  [/Only a pending offer can change its price/i, "Solo una oferta sin responder puede cambiar de precio."],
  [/Dog not found/i, "No encontramos a ese perro."],
  [/Request not found/i, "No encontramos esa oferta."],
  [/priceCop/i, "El precio debe estar entre $8.000 y $60.000."],
];

/** Maps an error to Spanish; anything unknown falls back to `fallback`. */
export function translateApiError(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      for (const [pattern, spanish] of KNOWN_ERRORS) {
        if (pattern.test(message)) {
          return spanish;
        }
      }
    }
  }
  return fallback;
}

/** "lun, 5 oct · 10:00 a. m." in Colombian Spanish; the raw value if it is not a date. */
export function formatWhenEs(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
