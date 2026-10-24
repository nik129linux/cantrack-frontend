import type { Session } from "@supabase/supabase-js";

/**
 * Development-only shortcut: opening the app with `?preview=owner` or
 * `?preview=walker` enters it with a fake session so the screens after the
 * login can be seen without a Supabase account. Production builds
 * (`import.meta.env.DEV` is false) never return a session here.
 */
export function readPreviewSession(search: string = window.location.search): Session | null {
  if (!import.meta.env.DEV) {
    return null;
  }

  const role = new URLSearchParams(search).get("preview");
  if (role !== "owner" && role !== "walker") {
    return null;
  }

  return {
    access_token: "preview",
    refresh_token: "preview",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: `preview-${role}`,
      aud: "authenticated",
      app_metadata: {},
      user_metadata: { role },
      created_at: "",
    },
  } as Session;
}
