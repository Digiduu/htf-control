"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import type { ModuleAccess, UserRole } from "../lib/auth/dal";

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
    href: "/report-progetti",
    label: "Report Progetti Digiduu",
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
        <path d="M10 12h6M10 15.5h6M10 8.5h2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/analisi-commessa",
    label: "Analisi commessa",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        className="h-4 w-4"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M20 20l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function Sidebar({
  role,
  moduleAccess = "all",
}: {
  role: UserRole;
  moduleAccess?: ModuleAccess;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Dentro l'iframe incastonato in Odoo la sessione è governata dall'SSO
  // (vedi app/auth/sso/route.ts): un logout qui romperebbe quel flusso senza
  // un modo per l'utente di rientrare se non ricliccando il menu su Odoo, e
  // comunque non è lui a "possedere" quella sessione in quel contesto —
  // quindi il pulsante va nascosto solo lì, non per chi usa l'app diretta.
  const [isEmbedded] = useState(() => typeof window !== "undefined" && window.self !== window.top);

  // Un superadmin vede comunque tutto, come per visibility_group. Per gli
  // altri, "pipeline_commerciale_only" nasconde le altre voci di modulo (le
  // pagine restano comunque protette da un redirect proprio — vedi il
  // commento in migration 20260918100000_module_access.sql).
  const visibleNavItems =
    role === "superadmin" || moduleAccess === "all"
      ? navItems
      : navItems.filter((item) => item.href === "/pipeline-commerciale");

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
