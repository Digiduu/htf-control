import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";

export type UserRole = "std_user" | "superadmin";

// Ambito di visibilità della Pipeline Commerciale (vedi migration
// 20260911140000_visibility_groups.sql) — ortogonale al ruolo: un superadmin
// vede comunque tutto a prescindere da questo campo.
export type VisibilityGroup = "global" | "commerciale_digiduu" | "project_leader";

// Ortogonale a role/visibility_group: quali PAGINE del sito un utente può
// raggiungere (visibility_group decide invece quali DATI vede dentro una
// pagina). Vedi migration 20260918100000_module_access.sql.
export type ModuleAccess = "all" | "pipeline_commerciale_only" | "digiduu" | "oriens";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  visibility_group: VisibilityGroup;
  project_leader_name: string | null;
  module_access: ModuleAccess;
  banned_until: string | null;
  created_at: string;
};

// Data Access Layer: unico punto in cui l'app legge "chi è l'utente corrente
// e che ruolo ha". cache() evita di rifare la query se più componenti la
// chiamano nello stesso render (es. il layout e la pagina).
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, visibility_group, project_leader_name, module_access, banned_until, created_at")
    .eq("id", user.id)
    .single();

  return profile as Profile | null;
});

// Confine di autorizzazione reale per l'area Amministrazione: va richiamato
// indipendentemente dalla pagina E da ogni Server Action, perché sidebar e
// layout non bloccano una richiesta diretta o una chiamata action bypassata
// dalla UI (vedi node_modules/next/dist/docs/01-app/02-guides/authentication.md).
export async function requireSuperadmin(): Promise<Profile> {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }
  if (profile.role !== "superadmin") {
    redirect("/pipeline-commerciale");
  }

  return profile;
}

// Stesso principio di requireSuperadmin, ma per pagine riservate a chi ha
// visibilità "global" (entrambe le aziende, tutti i Project Leader) — un
// superadmin vede comunque tutto, come ovunque nel resto dell'app. Va
// richiamato indipendentemente dalla Sidebar, che nasconde la voce solo per
// comodità visiva, non come confine di sicurezza reale.
export async function requireGlobalVisibility(): Promise<Profile> {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }
  if (profile.role !== "superadmin" && profile.visibility_group !== "global") {
    redirect("/pipeline-commerciale");
  }

  return profile;
}

// Stesso principio di requireSuperadmin/requireGlobalVisibility, ma per
// moduli riservati a chi ha un "Accesso moduli" tra quelli passati (o "all",
// sempre ammesso) — un superadmin vede comunque tutto. Va richiamato
// indipendentemente dalla Sidebar, che nasconde la voce solo per comodità
// visiva, non come confine di sicurezza reale (vedi migration
// 20260918100000_module_access.sql).
export async function requireModuleAccess(allowed: ModuleAccess[]): Promise<Profile> {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }
  if (profile.role !== "superadmin" && profile.module_access !== "all" && !allowed.includes(profile.module_access)) {
    redirect("/pipeline-commerciale");
  }

  return profile;
}
