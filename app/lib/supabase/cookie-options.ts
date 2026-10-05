import type { CookieOptions } from "@supabase/ssr";

// Nessun "server-only" qui: serve sia ai client server-side (middleware,
// server.ts, auth/sso/route.ts) sia al client browser (client.ts, per il
// refresh del token lato client dentro l'iframe) — è solo una trasformazione
// di dati, nessuna API server-only coinvolta.
//
// L'app è incastonata in un iframe su un'altra origin (Odoo): senza
// SameSite=None i cookie di sessione Supabase vengono scartati dal browser
// nel contesto cross-site dell'iframe (restano validi fuori dall'iframe,
// ma lì sembra sempre "non loggato"). SameSite=None richiede Secure, va
// bene perché l'app gira sempre su HTTPS (Vercel) — in locale (http) i
// browser ignorano Secure su localhost, quindi non rompe lo sviluppo.
export function forCrossSiteIframe(options?: CookieOptions): CookieOptions {
  return { ...options, sameSite: "none", secure: true };
}
