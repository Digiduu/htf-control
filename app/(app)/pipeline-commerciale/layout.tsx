import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile, homePath } from "../../lib/auth/dal";

// La pagina della Pipeline è un client component: il controllo lato server
// sta qui. Chi ha accesso al solo Report Assistenza viene rimandato alla sua
// pagina d'ingresso (i dati della Pipeline restano comunque protetti dalle
// RPC per visibility_group).
export default async function PipelineCommercialeLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile();
  const home = homePath(profile);
  if (home !== "/pipeline-commerciale") redirect(home);
  return children;
}
