"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import type { ModuleAccess, UserRole, VisibilityGroup } from "../lib/auth/dal";

const navItems = [
  {
    href: "/pipeline-commerciale",
    label: "Pipeline Commerciale",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M4 19V10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 19V5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 19v-7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 19V9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/portfolio-progetti-digiduu",
    label: "Portfolio Progetti Digiduu",
    // Sostituisce "Report Progetti Digiduu" (rimosso dal menu): qui la
    // sicurezza per Project Leader è imposta anche da RLS reali, non solo
    // dal redirect applicativo.
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        className="h-4 w-4"
        aria-hidden="true"
      >
        <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
        <path d="M8 8h3M8 12h8M8 16h8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/report-progetti-oriens",
    label: "Report Progetti Oriens",
    // Stesso principio di "Sintesi Pipeline": riservata a chi ha visibilità
    // "global" o è superadmin, controllo reale in requireGlobalVisibility()
    // dentro la pagina e nella RLS della tabella.
    requiresGlobal: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M7 3h8l4 4v14H7z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 3v4h4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12.5" cy="13" r="2.2" />
        <path d="M12.5 10.8v.5M12.5 14.7v.5M10.3 13h.5M14.2 13h.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Sidebar({
  role,
  moduleAccess = "all",
  visibilityGroup = "global",
}: {
  role: UserRole;
  moduleAccess?: ModuleAccess;
  visibilityGroup?: VisibilityGroup;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Dentro l'iframe incastonato in Odoo la sessione è governata dall'SSO
  // (vedi app/auth/sso/route.ts): un logout qui romperebbe quel flusso senza
  // un modo per l'utente di rientrare se non ricliccando il menu su Odoo, e
  // comunque non è lui a "possedere" quella sessione in quel contesto —
  // quindi il pulsante va nascosto solo lì, non per chi usa l'app diretta.
  // window.top non è noto in SSR: va letto dopo il mount, altrimenti l'HTML
  // del server (sempre isEmbedded=false) non combacerebbe con quello del
  // client dentro l'iframe, causando un hydration mismatch.
  const [isEmbedded, setIsEmbedded] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- vedi commento sopra, serve leggere window dopo il mount
    setIsEmbedded(window.self !== window.top);
  }, []);

  // Un superadmin vede comunque tutto, come per visibility_group. Per gli
  // altri, "Accesso moduli" restringe le voci di menu (le pagine restano
  // comunque protette da un redirect proprio — vedi il commento in migration
  // 20260918100000_module_access.sql): "pipeline_commerciale_only" mostra
  // solo la Pipeline Commerciale; "digiduu"/"oriens" aggiungono anche il
  // modulo della rispettiva azienda.
  const allowedHrefsByModuleAccess: Record<ModuleAccess, string[] | null> = {
    all: null, // null = nessuna restrizione
    pipeline_commerciale_only: ["/pipeline-commerciale"],
    digiduu: ["/pipeline-commerciale", "/portfolio-progetti-digiduu"],
    oriens: ["/pipeline-commerciale", "/report-progetti-oriens"],
  };
  const allowedHrefs = role === "superadmin" ? null : allowedHrefsByModuleAccess[moduleAccess];
  const visibleNavItems = (allowedHrefs ? navItems.filter((item) => allowedHrefs.includes(item.href)) : navItems).filter(
    (item) => !item.requiresGlobal || role === "superadmin" || visibilityGroup === "global"
  );

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      <div className="border-b border-gray-200 px-5 py-4">
        <span className="text-base font-semibold tracking-tight text-gray-900">
          HTF Control
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-violet-50 text-violet-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
      {role === "superadmin" && (
        <div className="border-t border-gray-200 px-2 py-4">
          <Link
            href="/amministrazione"
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              pathname === "/amministrazione"
                ? "bg-violet-50 text-violet-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              className="h-4 w-4"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="3" />
              <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M19 8h2M20 7v2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Amministrazione
          </Link>
        </div>
      )}
      {!isEmbedded && (
        <div className="border-t border-gray-200 px-2 py-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Esci
          </button>
        </div>
      )}
    </aside>
  );
}
