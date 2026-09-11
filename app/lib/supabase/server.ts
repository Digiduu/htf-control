import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase per Server Components / Route Handlers: legge e riscrive i
// cookie di sessione tramite l'API `cookies()` di Next.js. Il blocco try/catch
// nel setAll gestisce il caso in cui venga chiamato da un Server Component puro
// (dove Next.js non permette di scrivere cookie): va bene ignorarlo perché la
// sessione viene comunque rinfrescata dal middleware ad ogni richiesta.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chiamato da un Server Component: ignorabile, vedi commento sopra.
          }
        },
      },
    }
  );
}
