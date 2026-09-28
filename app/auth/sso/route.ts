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
    return NextResponse.json({ error: "missing token" }, { status: 400 });
  }

  const payload = verifySsoToken(token);
  if (!payload) {
    return NextResponse.json({ error: "invalid or expired token" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", payload.email)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      {
        error:
          "nessun profilo htf-control per questa email: crealo prima dall'area Amministrazione",
      },
      { status: 403 }
    );
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: payload.email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json({ error: "sso link generation failed" }, { status: 500 });
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
    return NextResponse.json({ error: "sso session exchange failed" }, { status: 401 });
  }

  return response;
}
