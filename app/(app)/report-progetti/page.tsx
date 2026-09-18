"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import type { ModuleAccess, VisibilityGroup } from "../../lib/auth/dal";
import type { ProjectLeaderReport } from "./lib/types";
import { fmtDays, fmtEUR, riepSummary, slugify } from "./lib/report-progetti-logic";
import { Kpi, KpiGrid } from "./components/Kpis";
import MethodNotes from "./components/MethodNotes";

export default function ReportProgettiPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [scope, setScope] = useState<{ visibilityGroup: VisibilityGroup; projectLeaderName: string | null } | null>(
    null
  );
  const [pls, setPls] = useState<ProjectLeaderReport[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ambito di visibilità: un Project Leader vede solo il proprio portfolio (non
  // ha senso mostrargli il Riepilogo con i ricavi di tutti gli altri PL), gli
  // altri gruppi e i superadmin vedono tutto — stesso principio già applicato
  // al filtro Project Leader della Pipeline Commerciale. L'accesso reale ai
  // dati resta comunque limitato dalla RLS (sola lettura per autenticati);
  // questo redirect è solo UX, non un confine di sicurezza a sé.
  useEffect(() => {
    let cancelled = false;
    async function loadScope() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("visibility_group, project_leader_name, role, module_access")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      // Un profilo "solo Pipeline Commerciale" (es. i commerciali) non deve
      // raggiungere questo modulo nemmeno digitando l'indirizzo a mano — la
      // Sidebar si limita a non mostrare la voce, il vero blocco è qui.
      const moduleAccess = (profile?.module_access ?? "all") as ModuleAccess;
      if (moduleAccess === "pipeline_commerciale_only" && profile?.role !== "superadmin") {
        router.replace("/pipeline-commerciale");
        return;
      }
      const visibilityGroup = (profile?.visibility_group ?? "global") as VisibilityGroup;
      const projectLeaderName = profile?.project_leader_name ?? null;
      setScope({ visibilityGroup, projectLeaderName });
      if (visibilityGroup === "project_leader" && profile?.role !== "superadmin" && projectLeaderName) {
        router.replace(`/report-progetti/${slugify(projectLeaderName)}`);
      }
    }
    loadScope();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadLatest() {
      setError(null);
      const { data: dates, error: err } = await supabase
        .from("report_progetti_generations")
        .select("date")
        .order("date", { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const latest = dates?.[0]?.date as string | undefined;
      if (!latest) {
        setPls([]);
        setLoading(false);
        return;
      }
      setGeneratedAt(latest);
      const { data, error: docErr } = await supabase
        .from("report_progetti_generations")
        .select("data")
        .eq("date", latest)
        .single();
      if (cancelled) return;
      if (docErr) {
        setError(docErr.message);
        setLoading(false);
        return;
      }
      setPls((data?.data as ProjectLeaderReport[]) ?? []);
      setLoading(false);
    }
    loadLatest();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    if (!pls) return [];
    return pls
      .map((pl) => ({ pl, summary: riepSummary(pl) }))
      .sort((a, b) => b.summary.prop_price - a.summary.prop_price);
  }, [pls]);

  const totals = useMemo(() => {
    return rows.reduce(
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
  }, [rows]);

  // Utente project_leader: non renderizzare il riepilogo mentre il redirect
  // alla propria pagina è in corso (evita un flash con i dati di tutti i PL).
  if (scope?.visibilityGroup === "project_leader") {
    return <div className="p-6 text-sm text-gray-500">Apertura del tuo portfolio…</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-1">
        <h1 className="text-xl font-semibold text-gray-900">Report Progetti Digiduu</h1>
        <p className="mt-1 text-sm text-gray-500">
          Riepilogo Project Leader — {pls ? `${pls.length} Project Leader` : loading ? "Caricamento…" : ""}
          {generatedAt ? ` · generazione del ${fmtDate(generatedAt)}` : ""}
        </p>
      </div>

      {error && (
        <div className="mb-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Errore nel leggere i dati: {error}
        </div>
      )}

      {!error && pls && pls.length === 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Nessuna generazione ancora disponibile.
        </div>
      )}

      {pls && pls.length > 0 && (
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
                  <th className="px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Project Leader
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Alert</th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Progetti (attivi/tot.)
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Giornate ordinate
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Ricavi baseline
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Ricavi actual
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Ricavi forecast
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Fatturato emesso
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ pl, summary }) => (
                  <tr
                    key={pl.pl_name}
                    className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                    onClick={() => router.push(`/report-progetti/${slugify(pl.pl_name)}`)}
                  >
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

          <MethodNotes riepilogo />
        </>
      )}
    </div>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}
