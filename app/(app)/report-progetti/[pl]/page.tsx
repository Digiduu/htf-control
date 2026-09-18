"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import type { ModuleAccess, VisibilityGroup } from "../../../lib/auth/dal";
import type { ProjectLeaderReport } from "../lib/types";
import { FILTERS, type FilterKey, fmtDays, fmtEUR, fmtEUR2, getAlerts, slugify } from "../lib/report-progetti-logic";
import { Kpi, KpiGrid } from "../components/Kpis";
import FilterTabs from "../components/FilterTabs";
import GroupRow from "../components/GroupRow";
import MethodNotes from "../components/MethodNotes";

export default function ReportProgettiPlPage() {
  const params = useParams<{ pl: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [scope, setScope] = useState<{ visibilityGroup: VisibilityGroup; projectLeaderName: string | null } | null>(
    null
  );
  const [pls, setPls] = useState<ProjectLeaderReport[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("attivi");

  // Stesso principio di /report-progetti: un Project Leader resta bloccato
  // sul proprio portfolio, anche digitando manualmente lo slug di un altro PL.
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
      const moduleAccess = (profile?.module_access ?? "all") as ModuleAccess;
      if (moduleAccess === "pipeline_commerciale_only" && profile?.role !== "superadmin") {
        router.replace("/pipeline-commerciale");
        return;
      }
      const visibilityGroup = (profile?.visibility_group ?? "global") as VisibilityGroup;
      const projectLeaderName = profile?.project_leader_name ?? null;
      setScope({ visibilityGroup, projectLeaderName });
      if (
        visibilityGroup === "project_leader" &&
        profile?.role !== "superadmin" &&
        projectLeaderName &&
        slugify(projectLeaderName) !== params.pl
      ) {
        router.replace(`/report-progetti/${slugify(projectLeaderName)}`);
      }
    }
    loadScope();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.pl]);

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

  const pl = useMemo(() => pls?.find((p) => slugify(p.pl_name) === params.pl) ?? null, [pls, params.pl]);

  const filteredGroups = useMemo(() => {
    if (!pl) return [];
    const filt = FILTERS.find((f) => f.key === filter)!;
    return pl.groups.filter(filt.fn);
  }, [pl, filter]);

  const totals = useMemo(() => {
    const sum = (key: "prop_days" | "prop_price" | "act_rev" | "act_days" | "plan_days" | "fc_rev") =>
      filteredGroups.reduce((a, g) => a + (g[key] || 0), 0);
    const propDays = sum("prop_days");
    const propPrice = sum("prop_price");
    const actRev = sum("act_rev");
    const actDays = sum("act_days");
    const fcRev = sum("fc_rev");
    const fcDays = filteredGroups.reduce((a, g) => a + g.act_days + g.plan_days, 0);
    const alertCount = filteredGroups.filter((g) => getAlerts(g).length > 0).length;
    return { propDays, propPrice, actRev, actDays, fcRev, fcDays, alertCount };
  }, [filteredGroups]);

  // Utente project_leader su uno slug che non è il proprio: non renderizzare
  // nulla mentre il redirect è in corso.
  if (scope?.visibilityGroup === "project_leader" && scope.projectLeaderName && slugify(scope.projectLeaderName) !== params.pl) {
    return <div className="p-6 text-sm text-gray-500">Apertura del tuo portfolio…</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Errore nel leggere i dati: {error}
        </div>
      </div>
    );
  }

  if (!loading && pls && !pl) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Project Leader non trovato in questa generazione.
        </div>
      </div>
    );
  }

  if (!pl) {
    return <div className="p-6 text-sm text-gray-500">{loading ? "Caricamento…" : ""}</div>;
  }

  const activeCount = pl.groups.filter((g) => g.active).length;
  const avgDailyBaseline = totals.propDays ? fmtEUR2(totals.propPrice / totals.propDays) : null;
  const avgDailyActual = totals.actDays ? fmtEUR2(totals.actRev / totals.actDays) : null;
  const avgDailyForecast = totals.fcDays ? fmtEUR2(totals.fcRev / totals.fcDays) : null;

  return (
    <div className="p-6">
      <div className="mb-1">
        <button
          type="button"
          onClick={() => router.push("/report-progetti")}
          className="mb-2 text-xs font-medium text-gray-500 hover:text-violet-700"
        >
          ← Riepilogo Project Leader
        </button>
        <h1 className="text-xl font-semibold text-gray-900">Portfolio di {pl.pl_name}</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Progetti Odoo Digiduu in cui {pl.pl_name} risulta Project Leader, raggruppati per Progetto Padre del conto
          analitico. {pl.groups.length} progetti padre ({activeCount} attivi).
        </p>
      </div>

      <KpiGrid>
        <Kpi
          label="Progetti padre"
          value={String(filteredGroups.length)}
          sub={
            filteredGroups.filter((g) => g.member_count > 1).length
              ? `${filteredGroups.filter((g) => g.member_count > 1).length} con più conti uniti`
              : `${filteredGroups.filter((g) => g.stage === "In corso").length} in corso · ${filteredGroups.filter((g) => g.stage === "Completato").length} completati`
          }
        />
        <Kpi label="Giornate ordinate" value={`${fmtDays(totals.propDays)} gg`} sub="somma proposte (PL&CF)" accent />
        <Kpi label="Ricavi baseline" value={fmtEUR(totals.propPrice)} sub={avgDailyBaseline ? `${avgDailyBaseline} /gg medio` : "somma proposte"} />
        <Kpi label="Ricavi actual" value={fmtEUR(totals.actRev)} sub={avgDailyActual ? `${avgDailyActual} /gg medio` : `${fmtDays(totals.actDays)} gg spese`} good />
        <Kpi label="Ricavi forecast" value={fmtEUR(totals.fcRev)} sub={avgDailyForecast ? `${avgDailyForecast} /gg medio` : "a fine progetto"} />
        <Kpi
          label="Progetti con alert"
          value={String(totals.alertCount)}
          sub="giornate sforate · SAL/Certificato assenti"
          critical={totals.alertCount > 0}
        />
      </KpiGrid>

      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs groups={pl.groups} active={filter} onChange={setFilter} />
        <span className="text-xs text-gray-500">
          {filteredGroups.length} progett{filteredGroups.length === 1 ? "o" : "i"} mostrat
          {filteredGroups.length === 1 ? "o" : "i"}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="w-6 px-3.5 py-2.5"></th>
              <th className="px-3.5 py-2.5">Progetto</th>
              <th className="px-3.5 py-2.5">Stato</th>
              <th className="px-3.5 py-2.5">Giornate: spese / ordinate</th>
              <th className="px-3.5 py-2.5 text-right">Ricavi baseline</th>
              <th className="px-3.5 py-2.5 text-right">Ricavi actual</th>
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map((g) => (
              <GroupRow key={g.id} group={g} />
            ))}
          </tbody>
        </table>
      </div>

      <MethodNotes plName={pl.pl_name} plNotes={pl.notes} />
    </div>
  );
}
