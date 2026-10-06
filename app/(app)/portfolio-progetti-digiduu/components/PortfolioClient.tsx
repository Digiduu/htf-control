"use client";

import { useMemo, useState } from "react";
import type { ProjectLeaderReport } from "../lib/types";
import { FILTERS, type FilterKey, fmtDays, fmtEUR, fmtEUR2, getAlerts } from "../lib/logic";
import { Kpi, KpiGrid } from "../../report-progetti/components/Kpis";
import FilterTabs from "../../report-progetti/components/FilterTabs";
import MonthlyCalendarTable from "./MonthlyCalendarTable";
import MethodNotes from "./MethodNotes";

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

  const pl = useMemo(() => allPls.find((p) => p.pl_name === selectedPl) ?? null, [allPls, selectedPl]);

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
      />

      <MethodNotes plName={pl.pl_name} plNotes={pl.notes} />
    </div>
  );
}
