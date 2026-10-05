import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { forCrossSiteIframe } from "./cookie-options";

const PUBLIC_PATHS = ["/login", "/auth/sso"];

// Rinfresca la sessione Supabase ad ogni richiesta e protegge tutte le route
// tranne quelle pubbliche (/login e /auth/sso, l'ingresso SSO dall'iframe
// Odoo — vedi app/auth/sso/route.ts): senza sessione valida si viene
// rimandati al login, con sessione valida non si può tornare al login.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, forCrossSiteIframe(options))
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/pipeline-commerciale";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
