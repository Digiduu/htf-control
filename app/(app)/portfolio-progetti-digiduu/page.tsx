import Link from "next/link";
import { requireModuleAccess } from "../../lib/auth/dal";
import { createClient } from "../../lib/supabase/server";
import { fetchVisibleGroups, groupByProjectLeader } from "./lib/data";
import PortfolioClient from "./components/PortfolioClient";

// "Il mio portfolio" (prompt di handoff §6.1), pagina iniziale del modulo.
// Server Component: la query gira con la sessione dell'utente, quindi la RLS
// di ppd_project_groups (vedi migration) restituisce già solo i gruppi che
// può vedere — un Project Leader non riceve mai righe di un altro PL, non
// solo per un redirect lato client come nel modulo "Report Progetti Digiduu".
// requireModuleAccess protegge anche da un utente con "Accesso moduli" non
// Digiduu che digita l'indirizzo a mano (vedi app/lib/auth/dal.ts).
export default async function PortfolioProgettiDigiduuPage() {
  const profile = await requireModuleAccess(["digiduu"]);

  const supabase = await createClient();
  const [rows, notesRes, analysisNotesRes] = await Promise.all([
    fetchVisibleGroups(supabase),
    supabase.from("ppd_pl_notes").select("pl_name, note"),
    supabase.from("ppd_analysis_notes").select("group_id, note"),
  ]);

  const plNotesByName = new Map<string, string[]>();
  for (const row of notesRes.data || []) {
    const list = plNotesByName.get(row.pl_name) || [];
    list.push(row.note);
    plNotesByName.set(row.pl_name, list);
  }

  const pls = groupByProjectLeader(rows, plNotesByName).sort((a, b) => a.pl_name.localeCompare(b.pl_name, "it"));

  const monthlyDaysByGroupId: Record<number, Record<string, number>> = {};
  for (const row of rows) monthlyDaysByGroupId[row.group.id] = row.monthlyDays;
  const todayISO = new Date().toISOString().slice(0, 10);

  const analysisNoteByGroupId: Record<number, string> = {};
  for (const row of (analysisNotesRes.data as { group_id: number; note: string }[] | null) || []) {
    analysisNoteByGroupId[row.group_id] = row.note;
  }

  const canPickAnyPl = profile.role === "superadmin" || profile.visibility_group === "global";
  const initialPlName = profile.project_leader_name && pls.some((p) => p.pl_name === profile.project_leader_name) ? profile.project_leader_name : null;

  return (
    <div className="p-6">
      <div className="mb-1">
        <h1 className="text-xl font-semibold text-gray-900">Portfolio Progetti Digiduu</h1>
        <p className="mt-1 text-sm text-gray-500">
          {canPickAnyPl ? (
            <>
              Vista per Project Leader — vedi{" "}
              <Link href="/portfolio-progetti-digiduu/recap" className="font-medium text-violet-700 hover:underline">
                il recap globale
              </Link>{" "}
              per il confronto tra tutti.
            </>
          ) : (
            "Il tuo portfolio progetti."
          )}
        </p>
      </div>

      <PortfolioClient
        allPls={pls}
        initialPlName={initialPlName}
        canPickAnyPl={canPickAnyPl}
        monthlyDaysByGroupId={monthlyDaysByGroupId}
        todayISO={todayISO}
        analysisNoteByGroupId={analysisNoteByGroupId}
      />
    </div>
  );
}
