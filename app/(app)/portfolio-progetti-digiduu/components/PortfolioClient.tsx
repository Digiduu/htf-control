"use client";

import { useMemo, useState } from "react";
import type { ProjectLeaderReport } from "../lib/types";
import { computeYearScopedMetrics, FILTERS, type FilterKey, fmtDays, fmtEUR, fmtEUR2, getAlerts } from "../lib/logic";
import { Kpi, KpiGrid } from "../../report-progetti/components/Kpis";
import FilterTabs from "../../report-progetti/components/FilterTabs";
import MonthlyCalendarTable from "./MonthlyCalendarTable";
import MethodNotes from "./MethodNotes";

function sumOf(groups: ProjectLeaderReport["groups"], key: "omaggio_days" | "sospese_days") {
  return groups.reduce((a, g) => a + (g[key] || 0), 0);
}

// "Il mio portfolio" (prompt di handoff §6.1): un Project Leader vede solo il
// proprio (allPls ha già un solo elemento, filtrato dalla RLS stessa a monte
// in page.tsx — non serve rifiltrare qui). Chi ha visibilità globale può
// scegliere qualunque PL dal selettore a pillole.
export default function PortfolioClient({
  allPls,
  initialPlName,
  canPickAnyPl,
  monthlyDaysByGroupId,
  todayISO,
  analysisNoteByGroupId,
}: {
  allPls: ProjectLeaderReport[];
  initialPlName: string | null;
  canPickAnyPl: boolean;
  monthlyDaysByGroupId: Record<number, Record<string, number>>;
  todayISO: string;
  analysisNoteByGroupId: Record<number, string>;
}) {
  const [selectedPl, setSelectedPl] = useState<string | null>(initialPlName ?? allPls[0]?.pl_name ?? null);
  const [filter, setFilter] = useState<FilterKey>("attivi");
  // null = nessun filtro anno (valori sull'intera vita del progetto, come
  // sempre); un anno specifico ricalcola ogni metrica per quell'anno solo —
  // vedi computeYearScopedMetrics per come vengono ripartite le metriche
  // "per tutta la vita del progetto" (giornate ordinate, baseline, forecast).
  const [yearFilter, setYearFilter] = useState<number | null>(null);

  const pl = useMemo(() => allPls.find((p) => p.pl_name === selectedPl) ?? null, [allPls, selectedPl]);

  const filteredGroups = useMemo(() => {
    if (!pl) return [];
    const filt = FILTERS.find((f) => f.key === filter)!;
    return pl.groups.filter(filt.fn);
  }, [pl, filter]);

  const totals = useMemo(() => {
    if (yearFilter) {
      const scoped = filteredGroups.map((g) => computeYearScopedMetrics(g, monthlyDaysByGroupId[g.id] || {}, yearFilter));
      const sum = (key: keyof (typeof scoped)[number]) => scoped.reduce((a, s) => a + (s[key] || 0), 0);
      const propDays = sum("propDays");
      const propPrice = sum("propPrice");
      const actRev = sum("actRev");
      const actDays = sum("actDays");
      const fcRev = sum("fcRev");
      const fcDays = scoped.reduce((a, s) => a + s.actDays + s.planDays, 0);
      const alertCount = filteredGroups.filter((g) => getAlerts(g).length > 0).length;
      const omaggioDays = sumOf(filteredGroups, "omaggio_days");
      const sospeseDays = sumOf(filteredGroups, "sospese_days");
      return { propDays, propPrice, actRev, actDays, fcRev, fcDays, alertCount, omaggioDays, sospeseDays };
    }
    const sum = (key: "prop_days" | "prop_price" | "act_rev" | "act_days" | "plan_days" | "fc_rev") =>
      filteredGroups.reduce((a, g) => a + (g[key] || 0), 0);
    const propDays = sum("prop_days");
    const propPrice = sum("prop_price");
    const actRev = sum("act_rev");
    const actDays = sum("act_days");
    const fcRev = sum("fc_rev");
    const fcDays = filteredGroups.reduce((a, g) => a + g.act_days + g.plan_days, 0);
    const alertCount = filteredGroups.filter((g) => getAlerts(g).length > 0).length;
    const omaggioDays = sumOf(filteredGroups, "omaggio_days");
    const sospeseDays = sumOf(filteredGroups, "sospese_days");
    return { propDays, propPrice, actRev, actDays, fcRev, fcDays, alertCount, omaggioDays, sospeseDays };
  }, [filteredGroups, yearFilter, monthlyDaysByGroupId]);

  if (!allPls.length) {
    return (
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Nessuna generazione ancora disponibile.
      </div>
    );
  }

  if (!pl) {
    return (
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Nessun Project Leader trovato per questo utente.
      </div>
    );
  }

  const activeCount = pl.groups.filter((g) => g.active).length;
  const avgDailyBaseline = totals.propDays ? fmtEUR2(totals.propPrice / totals.propDays) : null;
  const avgDailyActual = totals.actDays ? fmtEUR2(totals.actRev / totals.actDays) : null;
  const avgDailyForecast = totals.fcDays ? fmtEUR2(totals.fcRev / totals.fcDays) : null;

  return (
    <div>
      {canPickAnyPl && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {allPls.map((p) => (
            <button
              key={p.pl_name}
              type="button"
              onClick={() => setSelectedPl(p.pl_name)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                p.pl_name === selectedPl ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 hover:bg-violet-100"
              }`}
            >
              {p.pl_name} <span className="opacity-75">{p.groups.filter((g) => g.active).length}/{p.groups.length}</span>
            </button>
          ))}
        </div>
      )}

      <p className="mb-3 max-w-3xl text-sm text-gray-500">
        Progetti Odoo Digiduu in cui {pl.pl_name} risulta Project Leader, raggruppati per Progetto Padre del conto
        analitico. {pl.groups.length} progetti padre ({activeCount} attivi).
        {yearFilter && (
          <>
            {" "}
            <b className="text-violet-700">
              Dati del {yearFilter}: giornate spese e ricavi actual sono esatti; giornate ordinate, baseline e
              forecast sono ripartiti in proporzione allo sforzo di quell&apos;anno (sono valori sull&apos;intera
              vita del progetto, non hanno una data mese per mese).
            </b>
          </>
        )}
      </p>

      <KpiGrid>
        <Kpi
          label="Progetti padre"
          value={String(filteredGroups.length)}
          sub={`${filteredGroups.filter((g) => g.stage === "In corso").length} in corso · ${filteredGroups.filter((g) => g.stage === "Completato").length} completati`}
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
        <Kpi
          label="Giornate omaggio/sospese"
          value={`${fmtDays(totals.omaggioDays)} / ${fmtDays(totals.sospeseDays)} gg`}
          sub="totale sull'intera vita progetto, non filtrabile per anno"
        />
      </KpiGrid>

      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs groups={pl.groups} active={filter} onChange={setFilter} />
        <span className="text-xs text-gray-500">
          {filteredGroups.length} progett{filteredGroups.length === 1 ? "o" : "i"} mostrat
          {filteredGroups.length === 1 ? "o" : "i"}
        </span>
      </div>

      <MonthlyCalendarTable
        groups={filteredGroups}
        monthlyDaysByGroupId={monthlyDaysByGroupId}
        todayISO={todayISO}
        analysisNoteByGroupId={analysisNoteByGroupId}
        yearFilter={yearFilter}
        onYearFilterChange={setYearFilter}
      />

      <MethodNotes plName={pl.pl_name} plNotes={pl.notes} />
    </div>
  );
}
