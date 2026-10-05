import { createBrowserClient } from "@supabase/ssr";
import { forCrossSiteIframe } from "./cookie-options";

// cookieOptions con SameSite=None/Secure: il refresh del token lato client
// (es. onAuthStateChange) deve poter riscrivere il cookie anche dentro
// l'iframe cross-site di Odoo — vedi app/lib/supabase/cookie-options.ts.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: forCrossSiteIframe() }
  );
}
