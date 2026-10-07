import Link from "next/link";
import { requireGlobalVisibility, requireModuleAccess } from "../../../lib/auth/dal";
import { createClient } from "../../../lib/supabase/server";
import { fetchActivePhaseProjects, fetchVisibleGroups, groupByProjectLeader } from "../lib/data";
import { computeActivePhaseSummary, fmtDays, fmtEUR, riepSummary } from "../lib/logic";
import { Kpi, KpiGrid } from "../../report-progetti/components/Kpis";
import ActivePhaseSection from "../components/ActivePhaseSection";
import MethodNotes from "../components/MethodNotes";

// Recap globale (prompt di handoff §6.2), riservato a chi ha visibilità
// "global" o è superadmin — stesso guard già usato da Sintesi Pipeline e
// Report Progetti Oriens (requireGlobalVisibility), più la RLS reale sulle
// tabelle ppd_* sotto: anche aprendo l'URL a mano un Project Leader non
// riceverebbe comunque le righe degli altri PL. requireModuleAccess copre
// anche chi ha visibilità globale ma "Accesso moduli" non Digiduu (es. solo
// Oriens): senza questo controllo vedrebbe comunque il recap aprendo l'URL a
// mano, bypassando la Sidebar.
export default async function PortfolioProgettiDigiduuRecapPage() {
  await requireGlobalVisibility();
  await requireModuleAccess(["digiduu"]);

  const supabase = await createClient();
  const [rows, notesRes, activePhaseProjects, syncRunRes] = await Promise.all([
    fetchVisibleGroups(supabase),
    supabase.from("ppd_pl_notes").select("pl_name, note"),
    fetchActivePhaseProjects(supabase),
    supabase.from("ppd_sync_runs").select("data_as_of").order("data_as_of", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const activePhaseSummary = computeActivePhaseSummary(activePhaseProjects);
  const activePhaseDataAsOf = (syncRunRes.data as { data_as_of: string } | null)?.data_as_of ?? null;

  const plNotesByName = new Map<string, string[]>();
  for (const row of notesRes.data || []) {
    const list = plNotesByName.get(row.pl_name) || [];
    list.push(row.note);
    plNotesByName.set(row.pl_name, list);
  }

  const pls = groupByProjectLeader(rows, plNotesByName);
  const summaries = pls.map((pl) => ({ pl, summary: riepSummary(pl) })).sort((a, b) => b.summary.prop_price - a.summary.prop_price);

  const totals = summaries.reduce(
    (acc, { summary }) => ({
      activeCount: acc.activeCount + summary.activeCount,
      prop_days: acc.prop_days + summary.prop_days,
      prop_price: acc.prop_price + summary.prop_price,
      act_rev: acc.act_rev + summary.act_rev,
      fc_rev: acc.fc_rev + summary.fc_rev,
      invoiced_total: acc.invoiced_total + summary.invoiced_total,
      alertCount: acc.alertCount + summary.alertCount,
    }),
    { activeCount: 0, prop_days: 0, prop_price: 0, act_rev: 0, fc_rev: 0, invoiced_total: 0, alertCount: 0 }
  );

  return (
    <div className="p-6">
      <div className="mb-1">
        <Link href="/portfolio-progetti-digiduu" className="mb-2 inline-block text-xs font-medium text-gray-500 hover:text-violet-700">
          ← Il mio portfolio
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Recap globale — Portfolio Progetti Digiduu</h1>
        <p className="mt-1 text-sm text-gray-500">Confronto tra tutti i Project Leader, solo progetti padre attivi.</p>
      </div>

      {pls.length === 0 ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Nessuna generazione ancora disponibile.
        </div>
      ) : (
        <>
          <KpiGrid>
            <Kpi label="Progetti padre attivi" value={String(totals.activeCount)} sub={`su ${pls.length} Project Leader`} />
            <Kpi label="Giornate ordinate" value={`${fmtDays(totals.prop_days)} gg`} sub="somma proposte attive" accent />
            <Kpi label="Ricavi baseline" value={fmtEUR(totals.prop_price)} sub="somma proposte attive" />
            <Kpi label="Ricavi actual" value={fmtEUR(totals.act_rev)} sub="consuntivo progetti attivi" good />
            <Kpi label="Ricavi forecast" value={fmtEUR(totals.fc_rev)} sub="stima a fine progetto" />
            <Kpi
              label="Progetti con alert"
              value={String(totals.alertCount)}
              sub="giornate sforate · SAL/Certificato assenti"
              critical={totals.alertCount > 0}
            />
          </KpiGrid>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Project Leader</th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Alert</th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Progetti (attivi/tot.)</th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Giornate ordinate</th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Ricavi baseline</th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Ricavi actual</th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Ricavi forecast</th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Fatturato emesso</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map(({ pl, summary }) => (
                  <tr key={pl.pl_name} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3.5 py-2.5 font-medium text-gray-900">{pl.pl_name}</td>
                    <td className={`px-3.5 py-2.5 text-right tabular-nums ${summary.alertCount ? "font-semibold text-red-600" : "text-gray-500"}`}>
                      {summary.alertCount}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-gray-700">
                      {summary.activeCount} / {summary.totalCount}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-gray-700">{fmtDays(summary.prop_days)} gg</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-gray-700">{fmtEUR(summary.prop_price)}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-gray-700">{fmtEUR(summary.act_rev)}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-gray-700">{fmtEUR(summary.fc_rev)}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-gray-700">{fmtEUR(summary.invoiced_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ActivePhaseSection summary={activePhaseSummary} dataAsOf={activePhaseDataAsOf} />

          <MethodNotes />
        </>
      )}
    </div>
  );
}
