"use client";

import { useRef, useState } from "react";
import type { Group } from "../lib/types";
import {
  aggregateDaysBarInfo,
  buildMonthlyCalendarForClient,
  buildMonthlyCalendarForGroup,
  computeSharedStartMonth,
  daysBarInfo,
  fmtDays,
  fmtEUR,
  fmtMonth,
  getAlerts,
  getDataChecks,
  groupAndSortByClient,
  isBeforeNormalWindow,
  odooProjectUrl,
} from "../lib/logic";
import { GroupDetail } from "../../report-progetti/components/GroupRow";
import MonthCell from "./MonthCell";

const COLUMN_WIDTH = 112;
const FROZEN_WIDTH = 660;

// Tabella unica del portfolio (prompt di handoff §5.3/§6.1): una riga di
// totale per cliente, sotto i suoi progetti, con i mesi come colonne che
// scorrono in orizzontale e le colonne di sintesi fisse a sinistra. Il
// dettaglio di un progetto si apre in linea (riga espandibile), non su una
// pagina separata: contiene già tutto quello che serve (controlli sui dati,
// nota di analisi, schede economiche, fatture, milestone, documenti).
export default function MonthlyCalendarTable({
  groups,
  monthlyDaysByGroupId,
  todayISO,
  analysisNoteByGroupId,
}: {
  groups: Group[];
  monthlyDaysByGroupId: Record<number, Record<string, number>>;
  todayISO: string;
  analysisNoteByGroupId: Record<number, string>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { startMonth, extended } = computeSharedStartMonth(groups, todayISO);
  const clientGroups = groupAndSortByClient(groups);

  if (!groups.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Nessun progetto da mostrare con questo filtro.
      </div>
    );
  }

  const scrollToStart = () => scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  const scrollBack = () => scrollRef.current?.scrollBy({ left: COLUMN_WIDTH * 3, behavior: "smooth" });

  // Intestazioni mese: calcolate una sola volta da un calendario "modello"
  // (qualunque riga va bene, le colonne sono le stesse per costruzione).
  const headerColumns = buildMonthlyCalendarForClient(groups, monthlyDaysByGroupId, todayISO, startMonth).columns;

  return (
    <div>
      <Legend />

      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={scrollToStart}
          className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:border-violet-400 hover:text-violet-700"
        >
          ● Mese corrente
        </button>
        <button
          type="button"
          onClick={scrollBack}
          className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:border-violet-400 hover:text-violet-700"
        >
          Indietro nel tempo →
        </button>
        {extended && <span className="text-[11px] text-amber-700">Calendario esteso all&apos;inizio del progetto più vecchio mostrato (mesi in arancio)</span>}
      </div>

      <div className="@container overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm" ref={scrollRef}>
        <div className="min-w-max">
          {/* Intestazione */}
          <div className="flex border-b border-gray-200 bg-gray-50 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
            <div className="sticky left-0 z-10 flex shrink-0 bg-gray-50" style={{ width: FROZEN_WIDTH }}>
              <div className="w-6 px-1 py-2" />
              <div className="flex-1 px-2 py-2">Cliente / Progetto</div>
              <div className="w-[70px] px-2 py-2">Stato</div>
              <div className="w-[150px] px-2 py-2">Giornate spese/ord.</div>
              <div className="w-[90px] px-2 py-2 text-right">Baseline</div>
              <div className="w-[90px] px-2 py-2 text-right">Actual</div>
              <div className="w-[90px] px-2 py-2 text-right">Forecast</div>
            </div>
            {headerColumns.map((c) => (
              <div
                key={c.month}
                className={`w-28 shrink-0 border-l border-gray-200 px-1.5 py-2 ${
                  isBeforeNormalWindow(c.month, todayISO) ? "text-amber-700" : c.isCurrent ? "text-violet-700" : ""
                }`}
              >
                {c.isFutureBucket ? `DA ${fmtMonth(c.month).toUpperCase()}` : fmtMonth(c.month).toUpperCase()}
                {c.isCurrent && <div className="normal-case text-violet-600">in corso</div>}
              </div>
            ))}
          </div>

          {clientGroups.map(({ clientName, groups: clientProjects }) => {
            const clientCalendar = buildMonthlyCalendarForClient(clientProjects, monthlyDaysByGroupId, todayISO, startMonth);
            const bar = aggregateDaysBarInfo(clientProjects);
            const propDays = clientProjects.reduce((a, g) => a + (g.prop_days || 0), 0);
            const propPrice = clientProjects.reduce((a, g) => a + (g.prop_price || 0), 0);
            const actDays = clientProjects.reduce((a, g) => a + (g.act_days || 0), 0);
            const actRev = clientProjects.reduce((a, g) => a + (g.act_rev || 0), 0);
            const fcRev = clientProjects.reduce((a, g) => a + (g.fc_rev || 0), 0);
            const barColor =
              bar.className === "good" ? "bg-emerald-600" : bar.className === "warning" ? "bg-amber-500" : bar.className === "critical" ? "bg-red-600" : "bg-gray-300";

            return (
              <div key={clientName}>
                {/* Riga di totale cliente */}
                <div className="flex border-t border-gray-200 bg-gray-50/70">
                  <div className="sticky left-0 z-10 flex shrink-0 items-center bg-gray-50/70" style={{ width: FROZEN_WIDTH }}>
                    <div className="w-6" />
                    <div className="flex-1 px-2 py-2.5">
                      <span className="font-semibold text-gray-900">{clientName}</span>
                      <span className="ml-1.5 text-[11px] text-gray-500">{clientProjects.length} progett{clientProjects.length === 1 ? "o" : "i"}</span>
                    </div>
                    <div className="w-[70px] px-2 py-2.5" />
                    <div className="w-[150px] px-2 py-2.5">
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${bar.widthPct}%` }} />
                      </div>
                      <div className="mt-0.5 font-mono text-[10.5px] text-gray-500">
                        {fmtDays(actDays)} / {propDays ? fmtDays(propDays) : "—"} gg
                        {bar.ratio != null ? ` (${Math.round(bar.ratio * 100)}%)` : ""}
                      </div>
                    </div>
                    <div className="w-[90px] px-2 py-2.5 text-right font-mono tabular-nums text-gray-700">{fmtEUR(propPrice)}</div>
                    <div className="w-[90px] px-2 py-2.5 text-right font-mono tabular-nums text-gray-700">{fmtEUR(actRev)}</div>
                    <div className="w-[90px] px-2 py-2.5 text-right font-mono tabular-nums text-gray-700">{fmtEUR(fcRev)}</div>
                  </div>
                  {clientCalendar.columns.map((c) => (
                    <MonthCell key={c.month} column={c} />
                  ))}
                </div>

                {/* Progetti del cliente */}
                {clientProjects.map((g) => {
                  const calendar = buildMonthlyCalendarForGroup(g, monthlyDaysByGroupId[g.id] || {}, todayISO, startMonth);
                  const gBar = daysBarInfo(g);
                  const alerts = getAlerts(g);
                  const gBarColor =
                    gBar.className === "good" ? "bg-emerald-600" : gBar.className === "warning" ? "bg-amber-500" : gBar.className === "critical" ? "bg-red-600" : "bg-gray-300";
                  const open = expandedId === g.id;

                  return (
                    <div key={g.id} className={open ? "bg-violet-50/40" : undefined}>
                      <div className="flex cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => setExpandedId(open ? null : g.id)}>
                        <div className="sticky left-0 z-10 flex shrink-0 items-start bg-white" style={{ width: FROZEN_WIDTH }}>
                          <div className="w-6 px-1 py-3">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-label="Espandi dettaglio"
                              className="flex h-5 w-5 items-center justify-center rounded-md border border-gray-300 text-xs text-gray-500 hover:border-violet-400 hover:text-violet-700"
                            >
                              {open ? "−" : "+"}
                            </button>
                          </div>
                          <div className="flex-1 px-2 py-3">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="font-medium text-gray-900">{g.name}</span>
                              <a
                                href={odooProjectUrl(g.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="Apri il progetto in Odoo"
                                className="text-gray-400 hover:text-violet-600"
                              >
                                ↗
                              </a>
                              {g.member_count > 1 && (
                                <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-violet-700">{g.member_count} conti</span>
                              )}
                            </div>
                            {alerts.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {alerts.map((a) => (
                                  <span
                                    key={a.key}
                                    title={a.detail}
                                    className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${a.key === "sforamento" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
                                  >
                                    ⚠ {a.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="w-[70px] px-2 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.stage === "Completato" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                              {g.stage}
                            </span>
                            {!g.active && <div className="mt-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Archiviato</div>}
                          </div>
                          <div className="w-[150px] px-2 py-3">
                            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                              <div className={`h-full rounded-full ${gBarColor}`} style={{ width: `${gBar.widthPct}%` }} />
                            </div>
                            <div className="mt-0.5 font-mono text-[10.5px] text-gray-500">
                              {fmtDays(g.act_days)} / {g.prop_days ? fmtDays(g.prop_days) : "—"} gg
                              {gBar.ratio != null ? ` (${Math.round(gBar.ratio * 100)}%)` : ""}
                            </div>
                          </div>
                          <div className="w-[90px] px-2 py-3 text-right font-mono tabular-nums text-gray-700">{fmtEUR(g.prop_price)}</div>
                          <div className="w-[90px] px-2 py-3 text-right font-mono tabular-nums text-gray-700">{fmtEUR(g.act_rev)}</div>
                          <div className="w-[90px] px-2 py-3 text-right font-mono tabular-nums text-gray-700">{fmtEUR(g.fc_rev)}</div>
                        </div>
                        {calendar.columns.map((c) => (
                          <MonthCell key={c.month} column={c} />
                        ))}
                      </div>
                      {open && (
                        <div className="sticky left-0 z-10 w-[100cqw] border-t border-violet-200 bg-white shadow-sm">
                          <div className="flex items-center justify-between border-b border-gray-100 bg-violet-50/60 px-4 py-2.5">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                              {g.name}
                              <a
                                href={odooProjectUrl(g.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Apri il progetto in Odoo"
                                className="text-xs font-normal text-gray-400 hover:text-violet-600"
                              >
                                ↗ Odoo
                              </a>
                            </span>
                            <button
                              type="button"
                              onClick={() => setExpandedId(null)}
                              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:border-violet-400 hover:text-violet-700"
                            >
                              × Chiudi
                            </button>
                          </div>
                          <div className="space-y-3 px-4 py-4">
                            {(() => {
                              const checks = getDataChecks(g, todayISO);
                              const note = analysisNoteByGroupId[g.id];
                              return (
                                <>
                                  {checks.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {checks.map((c) => (
                                        <span key={c.key} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                                          ⓘ {c.label}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {note && (
                                    <div className="rounded-md border-l-4 border-orange-400 bg-orange-50 px-3.5 py-2.5 text-sm text-orange-900">
                                      <b>Nota di analisi:</b> {note}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                            <GroupDetail group={g} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const items: { swatch: string; label: string }[] = [
    { swatch: "bg-emerald-600", label: "Fatturato confermato" },
    { swatch: "bg-blue-500", label: "Bozza" },
    { swatch: "bg-red-600", label: "< 700 €/gg" },
    { swatch: "bg-amber-400", label: "Fine progetto" },
    { swatch: "bg-violet-600", label: "Milestone futura" },
    { swatch: "bg-red-700", label: "Milestone scaduta" },
    { swatch: "bg-gray-400", label: "Giornate pianificate" },
  ];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-gray-500">
      <span className="font-semibold text-gray-600">Legenda:</span>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${it.swatch}`} />
          {it.label}
        </span>
      ))}
      <span>ⓘ milestone senza data</span>
    </div>
  );
}
