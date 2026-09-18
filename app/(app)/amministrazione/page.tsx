import { requireSuperadmin } from "../../lib/auth/dal";
import { createClient } from "../../lib/supabase/server";
import UserAdminTable from "./UserAdminTable";
import type { Profile } from "./lib/types";

// Confine di sicurezza reale dell'area Amministrazione: indipendente dal
// fatto che la voce sia visibile o meno nella Sidebar (vedi app/lib/auth/dal.ts).
export default async function AmministrazionePage() {
  const currentProfile = await requireSuperadmin();

  const supabase = await createClient();
  const [{ data, error }, { data: projectLeaderRows, error: plError }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, full_name, role, visibility_group, project_leader_name, module_access, banned_until, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase.rpc("digiduu_project_leaders"),
  ]);

  const users = (data ?? []) as Profile[];
  const projectLeaderOptions = (projectLeaderRows ?? []).map((r: { project_leader: string }) => r.project_leader);

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Amministrazione</h1>
        <p className="mt-1 text-sm text-gray-500">Crea, disabilita ed elimina gli utenti di HTF Control.</p>
      </div>

      {(error || plError) && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Errore nel leggere gli utenti: {error?.message ?? plError?.message}
        </div>
      )}

      <UserAdminTable users={users} currentUserId={currentProfile.id} projectLeaderOptions={projectLeaderOptions} />
    </div>
  );
}
