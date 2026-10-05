import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { verifySsoToken } from "@/app/lib/auth/sso";

// Serve la service role key: deve girare col runtime Node, non Edge.
export const runtime = "nodejs";

const TARGET_PATHS: Record<string, string> = {
  pipeline_commerciale: "/pipeline-commerciale",
  analisi_commessa: "/analisi-commessa",
  report_progetti: "/report-progetti",
  amministrazione: "/amministrazione",
};

// Pagina di errore coerente con lo stile dell'app (stessa card del login):
// questo endpoint viene aperto dentro l'iframe di Odoo, non da un utente che
// naviga a mano, quindi un JSON grezzo non aiuta nessuno — meglio un
// messaggio leggibile con l'azione da fare.
function ssoErrorPage(message: string, status: number) {
  const html = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <title>HTF Control</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;display:flex;min-height:100vh;width:100%;align-items:center;justify-content:center;background:#fff;padding:0 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="width:100%;max-width:24rem;border:1px solid #e5e7eb;border-radius:0.5rem;padding:2rem;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
      <h1 style="margin:0 0 0.25rem;font-size:1.125rem;font-weight:600;color:#111827;">HTF Control</h1>
      <p style="margin:0 0 1rem;font-size:0.875rem;color:#6b7280;">Accesso non riuscito</p>
      <p style="margin:0;font-size:0.875rem;color:#b91c1c;">${message}</p>
    </div>
  </body>
</html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Punto di ingresso SSO per l'iframe incastonato in Odoo (modulo
// oriens_htf_control): riceve un token HS256 di breve durata firmato dal
// controller Odoo con lo stesso secret condiviso (HTF_CONTROL_SSO_SECRET),
// verifica email + scadenza e apre una sessione Supabase per l'utente senza
// password — ci si fida del secret condiviso esattamente come farebbe un
// qualunque iframe SSO imbustato in un altro backend.
//
// Il mapping è per email e presuppone che esista già un profilo Supabase con
// la stessa email dell'utente Odoo (creato dall'area Amministrazione o dagli
// script scripts/create-*.mjs): se non esiste, l'accesso viene rifiutato
// invece di creare silenziosamente un utente Supabase "orfano" senza riga in
// `profiles`.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return ssoErrorPage("Link di accesso non valido: manca il token.", 400);
  }

  const payload = verifySsoToken(token);
  if (!payload) {
    return ssoErrorPage(
      "Link di accesso scaduto o non valido: torna su Odoo e riapri il menu HTF Control.",
      401
    );
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", payload.email)
    .maybeSingle();

  if (!profile) {
    return ssoErrorPage(
      `Nessun profilo HTF Control per l'email <strong>${payload.email}</strong>. ` +
        "Chiedi a un amministratore di crearlo dall'area Amministrazione.",
      403
    );
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: payload.email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return ssoErrorPage("Errore tecnico nella generazione dell'accesso. Riprova tra poco.", 500);
  }

  const redirectPath = TARGET_PATHS[payload.target] ?? "/pipeline-commerciale";
  const response = NextResponse.redirect(new URL(redirectPath, request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: linkData.properties.hashed_token,
  });

  if (verifyError) {
    return ssoErrorPage("Errore tecnico nell'apertura della sessione. Riprova tra poco.", 401);
  }

  return response;
}
