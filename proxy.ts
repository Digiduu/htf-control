import { type NextRequest } from "next/server";
import { updateSession } from "@/app/lib/supabase/middleware";

// Rinominato da middleware.ts a proxy.ts: in questa versione di Next.js la
// convenzione "middleware" è deprecata in favore di "proxy" (stessa API,
// stesso comportamento — vedi node_modules/next/dist/docs/.../proxy.md).
//
// Nota sull'area /amministrazione: il ruolo utente non è nel cookie/JWT di
// sessione, quindi qui potremmo controllarlo solo con una query DB ad ogni
// richiesta (anche sui prefetch) — esattamente ciò che la guida auth di
// Next.js sconsiglia per il proxy. Il vero controllo di autorizzazione vive
// in app/lib/auth/dal.ts (requireSuperadmin), richiamato dalla pagina e da
// ogni Server Action, con RLS come seconda linea di difesa. Se in futuro il
// ruolo finisse in un custom claim del JWT, varrebbe la pena spostare qui
// anche un controllo ottimistico.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
