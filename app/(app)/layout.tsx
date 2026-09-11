import type { ReactNode } from "react";
import Sidebar from "../components/Sidebar";
import { getCurrentProfile } from "../lib/auth/dal";

// Layout condiviso da tutte le route autenticate (Pipeline Commerciale,
// Analisi Commessa, e i moduli futuri): la sidebar vive qui, non nel root
// layout, così /login resta fuori da questo gruppo e non la mostra.
//
// Il ruolo letto qui serve solo a decidere cosa mostrare nella Sidebar
// (voce "Amministrazione"): non è il confine di sicurezza dell'area
// /amministrazione, che si autoverifica in modo indipendente (vedi
// app/lib/auth/dal.ts) — un layout non blocca una richiesta diretta alla
// route figlia.
export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await getCurrentProfile();

  return (
    <>
      <Sidebar role={profile?.role ?? "std_user"} />
      <main className="flex-1 overflow-y-auto bg-white">{children}</main>
    </>
  );
}
