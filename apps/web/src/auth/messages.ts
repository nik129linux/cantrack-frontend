/** Spanish copy for the auth screens (the UI is Spanish, the code is English). */

export const authCopy = {
  role: {
    title: "¿Cómo quieres usar CanTrack?",
    subtitle: "Elige tu perfil para empezar.",
    legend: "Elige tu perfil",
    owner: {
      title: "Soy dueño",
      text: "Encuentra a alguien de confianza para pasear a tu peludo.",
      perks: ["Paseo en vivo", "Fotos del paseo", "Pago seguro"],
    },
    walker: {
      title: "Soy paseador",
      text: "Pasea perros cerca de ti y organiza tu día.",
      perks: ["Tu propio horario", "Rutas inteligentes", "Pagos semanales"],
    },
    next: "Continuar",
    haveAccount: "¿Ya tienes cuenta?",
    goLogin: "Ingresa",
    chip: { owner: "Dueño", walker: "Paseador" },
    change: "Cambiar",
    registeringAs: "Te registras como",
  },
  verify: {
    resend: "Reenviar link",
    resent: "Si la cuenta existe, te enviamos un nuevo link.",
    activated: "¡Cuenta activada!",
  },
  loading: {
    signup: "Creando tu cuenta…",
    login: "Ingresando…",
    reset: "Enviando el enlace…",
    role: "Un momento…",
  },
  signup: {
    title: "Crea tu cuenta",
    subtitle: "Paseos con tranquilidad para tu peludo.",
    submit: "Crear cuenta",
    submitting: "Creando cuenta…",
    divider: "o regístrate con",
    consent: "Acepto el tratamiento de datos personales y los términos de uso",
    haveAccount: "¿Ya tienes cuenta?",
    goLogin: "Ingresa",
    done: "Revisa tu correo: te enviamos un link para activar la cuenta.",
    passwordTip: "Tip: una frase larga es más segura que una palabra rara",
  },
  login: {
    title: "Qué bueno verte de nuevo",
    subtitle: "Entra para ver tus paseos.",
    submit: "Ingresar",
    submitting: "Ingresando…",
    divider: "o continúa con",
    forgot: "¿Olvidaste tu contraseña?",
    noAccount: "¿No tienes cuenta?",
    goSignup: "Regístrate",
  },
  reset: {
    title: "Recupera tu contraseña",
    subtitle: "Te enviamos un enlace a tu correo.",
    submit: "Enviar enlace",
    submitting: "Enviando…",
    back: "Volver a ingresar",
    sent: "Revisa tu correo: te enviamos un enlace para restablecer tu contraseña.",
  },
  fields: {
    email: "Correo electrónico",
    password: "Contraseña",
    showPassword: "Mostrar clave",
    hidePassword: "Ocultar clave",
    role: "Soy…",
    walker: "Paseador",
    owner: "Dueño",
  },
  errors: {
    emailRequired: "Escribe tu correo electrónico.",
    consentRequired: "Marca la casilla de datos personales para continuar.",
    oauth: "No pudimos conectar con ese servicio. Inténtalo de nuevo.",
    passwordRequired: "Escribe tu contraseña.",
    signup: "No pudimos crear tu cuenta. Inténtalo de nuevo.",
    login: "Correo o contraseña incorrectos.",
    reset: "No pudimos enviar el correo. Inténtalo de nuevo.",
  },
} as const;

const knownAuthErrors: ReadonlyArray<readonly [RegExp, string]> = [
  [/already registered|already been registered/i, "Ese correo ya tiene una cuenta."],
  [/invalid login credentials/i, "Correo o contraseña incorrectos."],
  [/email not confirmed/i, "Confirma tu correo antes de ingresar."],
  [/password should be at least/i, "La contraseña es muy corta."],
  [/rate limit|too many requests/i, "Demasiados intentos. Espera un momento."],
  [/invalid.*email|unable to validate email/i, "Ese correo no parece válido."],
];

/** Maps a Supabase error message to Spanish; unknown ones fall back to `fallback`. */
export function translateAuthError(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      for (const [pattern, spanish] of knownAuthErrors) {
        if (pattern.test(message)) {
          return spanish;
        }
      }
    }
  }
  return fallback;
}

/** Status-aware copy for the /auth endpoints (login, signup, password rules). */
export function translateApiAuthError(
  error: { status: number; message: string },
  fallback: string,
): string {
  if (error.status === 401) {
    return "Correo o contraseña incorrectos.";
  }
  if (error.status === 403) {
    return "Primero confirma tu correo.";
  }
  if (error.status === 429) {
    return "Demasiados intentos. Intenta de nuevo en 15 minutos.";
  }
  if (/already registered|already been registered/i.test(error.message)) {
    return "Ese correo ya tiene una cuenta.";
  }
  if (error.status === 400) {
    if (/10 characters|too short|at least 10/i.test(error.message)) {
      return "Usa al menos 10 caracteres (una frase sirve)";
    }
    if (/common/i.test(error.message)) {
      return "Esa contraseña es muy común";
    }
    if (/email/i.test(error.message)) {
      return "No uses tu correo dentro de la contraseña";
    }
  }
  return fallback;
}
