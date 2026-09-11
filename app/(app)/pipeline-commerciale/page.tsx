"use client";

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createClient } from "../../lib/supabase/client";
import type { VisibilityGroup } from "../../lib/auth/dal";
import type { Company, PipelineDoc, RevenueStep } from "./lib/types";
import {
  STATE_COLOR,
  MESI,
  fmt,
  fmtSigned,
  buildNoteLookup,
  mergeOrderRows,
  type MergedRow,
} from "./lib/pipeline-logic";

type FrozenCol = { key: string; label: string; width: number; left: number; last: boolean; num?: boolean };

const FROZEN_DUAL: Omit<FrozenCol, "left" | "last">[] = [
  { key: "account", label: "Account", width: 128 },
  { key: "project_leader", label: "Project Leader", width: 148 },
  { key: "cliente", label: "Cliente", width: 210 },
  { key: "origine", label: "Origine", width: 108 },
  { key: "ordinato", label: "Ordinato", width: 108, num: true },
];

const FROZEN_SINGLE: Omit<FrozenCol, "left" | "last">[] = [
  { key: "referente", label: "Referente", width: 160 },
  { key: "cliente", label: "Cliente", width: 210 },
  { key: "origine", label: "Origine", width: 108 },
  { key: "ordinato", label: "Ordinato", width: 108, num: true },
];

function frozenCols(dual: boolean): FrozenCol[] {
  const cols = dual ? FROZEN_DUAL : FROZEN_SINGLE;
  let left = 0;
  return cols.map((c, i) => {
    const withLeft = { ...c, left, last: i === cols.length - 1 };
    left += c.width;
    return withLeft;
  });
}

function frozenStyle(col: FrozenCol, background: string, extra?: CSSProperties): CSSProperties {
  return {
    position: "sticky",
    left: col.left,
    width: col.width,
    minWidth: col.width,
    maxWidth: col.width,
    background,
    ...extra,
  };
}

function fmtDateLabel(iso: string) {
  try {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
}

const HEADER_BG = "#3d4a55";
const TOTAL_BG = "#44546a";
const CRM_BG = "#fdebd0";
const STRIPE = "#fafaf8";

export default function PipelineCommercialePage() {
  const supabase = useMemo(() => createClient(), []);

  const [company, setCompany] = useState<Company | null>(null);
  const [scope, setScope] = useState<{ visibilityGroup: VisibilityGroup; projectLeaderName: string | null } | null>(
    null
  );
  const [datesByCompany, setDatesByCompany] = useState<Record<Company, string[]>>({ oriens: [], digiduu: [] });
  const [selectedDate, setSelectedDate] = useState("");
  const [doc, setDoc] = useState<PipelineDoc | null>(null);
  const [prevDoc, setPrevDoc] = useState<PipelineDoc | null>(null);
  const [plFilter, setPlFilter] = useState("");
  const [filterText, setFilterText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ambito di visibilità dell'utente corrente: un utente globale vede tutto
  // (comportamento invariato, azienda di default "oriens"), gli altri gruppi
  // sono forzati su Digiduu — unica azienda con dettaglio Project Leader
  // (vedi migration 20260911140000_visibility_groups.sql). L'accesso reale ai
  // dati di un'altra azienda resta comunque bloccato dalla RLS a prescindere
  // da questo stato, che serve solo a scegliere cosa mostrare in UI.
  useEffect(() => {
    let cancelled = false;
    async function loadScope() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("visibility_group, project_leader_name")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      const visibilityGroup = (profile?.visibility_group ?? "global") as VisibilityGroup;
      const projectLeaderName = profile?.project_leader_name ?? null;
      setScope({ visibilityGroup, projectLeaderName });
      setCompany(visibilityGroup === "global" ? "oriens" : "digiduu");
    }
    loadScope();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elenco date disponibili per l'azienda selezionata (ascendente) + selezione
  // di default sull'ultima (più recente), come nell'Artifact originale.
  useEffect(() => {
    if (!company) return;
    const activeCompany = company;
    let cancelled = false;
    async function loadDates() {
      setError(null);
      const { data, error: err } = await supabase
        .from("pipeline_generations")
        .select("date")
        .eq("company", activeCompany)
        .order("date", { ascending: true });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const dates = (data || []).map((r) => r.date as string);
      setDatesByCompany((prev) => ({ ...prev, [activeCompany]: dates }));
      if (dates.length) {
        setSelectedDate(dates[dates.length - 1]);
      } else {
        setSelectedDate("");
        setDoc(null);
        setPrevDoc(null);
        setLoading(false);
      }
    }
    loadDates();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  // Documento della data selezionata + generazione immediatamente precedente
  // (serve per calcolare la colonna Nota).
  useEffect(() => {
    if (!selectedDate || !company) return;
    const activeCompany = company;
    let cancelled = false;
    async function loadDoc() {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("pipeline_generations")
        .select("data")
        .eq("company", activeCompany)
        .eq("date", selectedDate)
        .single();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const currentDoc = data?.data as PipelineDoc;
      setDoc(currentDoc);
      setPlFilter("");

      const asc = datesByCompany[activeCompany] || [];
      const idx = asc.indexOf(selectedDate);
      if (idx > 0) {
        const { data: prevData } = await supabase
          .from("pipeline_generations")
          .select("data")
          .eq("company", activeCompany)
          .eq("date", asc[idx - 1])
          .single();
        if (!cancelled) setPrevDoc((prevData?.data as PipelineDoc) ?? null);
      } else {
        setPrevDoc(null);
      }
      if (!cancelled) setLoading(false);
    }
    loadDoc();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, company]);

  const dual = !!doc?.dual_mode;
  const cols = useMemo(() => frozenCols(dual), [dual]);

  const plNames = useMemo(() => {
    if (!doc || !dual) return [];
    const names = new Set<string>();
    for (const r of doc.rows || []) {
      if (r.project_leader) names.add(r.project_leader);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "it"));
  }, [doc, dual]);

  // Un Project Leader resta sempre bloccato sul proprio nome (non può
  // allargare la vista alle commesse altrui): calcolato direttamente in
  // render, non con un effect che copia scope dentro plFilter.
  const effectivePlFilter = scope?.visibilityGroup === "project_leader" ? scope.projectLeaderName ?? "" : plFilter;
  const plActive = company === "digiduu" && dual && !!effectivePlFilter;

  const mergedRows = useMemo<MergedRow[]>(() => {
    if (!doc) return [];
    let rows = mergeOrderRows(doc.rows || []);
    if (plActive) {
      rows = rows.filter((r) => r.project_leader === effectivePlFilter);
    }
    return rows;
  }, [doc, plActive, effectivePlFilter]);

  const noteFor = useMemo(() => buildNoteLookup(doc as PipelineDoc, prevDoc), [doc, prevDoc]);

  const visibleRows = useMemo(
    () => mergedRows.filter((r) => !filterText || (r.cliente || "").toLowerCase().includes(filterText.toLowerCase())),
    [mergedRows, filterText]
  );

  const anyFilter = plActive || !!filterText;

  const totals = useMemo(() => {
    if (!anyFilter) return doc?.overall ?? { ordinato: 0, months: new Array(12).fill(0), totale: 0 };
    const months = new Array(12).fill(0);
    let ordinato = 0;
    let totale = 0;
    for (const r of visibleRows) {
      ordinato += r.ordinato || 0;
      totale += r.totale || 0;
      for (let i = 0; i < 12; i++) months[i] += r.months[i] || 0;
    }
    return { ordinato, months, totale };
  }, [anyFilter, doc, visibleRows]);

  const descDates = useMemo(
    () => [...((company ? datesByCompany[company] : []) || [])].reverse(),
    [datesByCompany, company]
  );

  return (
    <div className="p-6">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pipeline Commerciale</h1>
          <p className="mt-1 text-sm text-gray-500">
            {doc
              ? `${doc.label} ${doc.year} — ${fmtDateLabel(selectedDate)}${
                  doc.generated_at ? ` · generato ${new Date(doc.generated_at).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}` : ""
                } · ${(doc.rows || []).length} righe`
              : loading
                ? "Caricamento…"
                : "Nessuna generazione disponibile."}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        {scope?.visibilityGroup === "global" && (
          <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {(["oriens", "digiduu"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCompany(c)}
                className={`px-4 py-2 text-sm font-semibold ${
                  company === c ? "bg-violet-50 text-violet-700" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {c === "oriens" ? "Oriens Consulting" : "Digiduu"}
              </button>
            ))}
          </div>
        )}
        {scope && scope.visibilityGroup !== "global" && (
          <span className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm">
            Digiduu
          </span>
        )}

        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none"
        >
          {descDates.length === 0 && <option>Nessuno storico disponibile</option>}
          {descDates.map((d) => (
            <option key={d} value={d}>
              {fmtDateLabel(d)}
            </option>
          ))}
        </select>

        {dual && plNames.length > 0 && scope?.visibilityGroup !== "project_leader" && (
          <select
            value={plFilter}
            onChange={(e) => setPlFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none"
          >
            <option value="">Tutti i Project Leader</option>
            {plNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
        {scope?.visibilityGroup === "project_leader" && (
          <span className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm">
            Project Leader: {scope.projectLeaderName}
          </span>
        )}

        <div className="flex-1" />

        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filtra per cliente…"
          className="w-56 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Errore nel leggere i dati: {error}
        </div>
      )}

      {doc?.revenue_summary && <RevenueSummaryPanel doc={doc} plActive={plActive} plFilter={effectivePlFilter} />}

      <Legend />

      {doc?.source_note && <p className="mb-3.5 text-xs text-gray-500">{doc.source_note}</p>}

      {!doc && !loading && !error && (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Nessuna generazione ancora disponibile per {company === "oriens" ? "Oriens Consulting" : "Digiduu"}.
        </div>
      )}

      {doc && scope?.visibilityGroup === "project_leader" && !dual && (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Nessun dettaglio Project Leader disponibile per questa generazione.
        </div>
      )}

      {doc && !(scope?.visibilityGroup === "project_leader" && !dual) && (
        <>
          <div className="overflow-auto rounded-lg border border-gray-200 shadow-sm" style={{ maxHeight: "72vh" }}>
            <table className="w-full border-separate border-spacing-0 whitespace-nowrap text-[12.5px]">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th
                      key={c.key}
                      className={`px-2.5 py-2 text-left font-semibold text-white ${c.num ? "text-right" : ""}`}
                      style={frozenStyle(c, HEADER_BG, {
                        top: 0,
                        zIndex: c.last ? 3 : 2,
                        boxShadow: c.last ? "4px 0 6px -4px rgba(0,0,0,.28)" : undefined,
                      })}
                    >
                      {c.label}
                    </th>
                  ))}
                  {MESI.map((m) => (
                    <th key={m} className="sticky top-0 z-10 px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                      {m}
                    </th>
                  ))}
                  <th className="sticky top-0 z-10 px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                    Totale {doc.year}
                  </th>
                  <th className="sticky top-0 z-10 min-w-[190px] px-2.5 py-2 text-left font-semibold text-white" style={{ background: HEADER_BG }}>
                    Nota
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, rowIdx) => {
                  const rowBg = rowIdx % 2 === 0 ? "#ffffff" : STRIPE;
                  const nota = noteFor(r);
                  return (
                    <tr key={`${r.origine ?? "x"}-${r.cliente}-${rowIdx}`} className={r.is_crm ? "" : undefined}>
                      {cols.map((c) => {
                        const isCliente = c.key === "cliente";
                        const cellBg = isCliente && r.is_crm ? CRM_BG : rowBg;
                        let value: string | number | null = "";
                        if (c.key === "ordinato") value = fmt(r.ordinato);
                        else value = (r as unknown as Record<string, string | null>)[c.key] || "";
                        return (
                          <td
                            key={c.key}
                            title={isCliente && r.is_crm && r.crm_comment ? r.crm_comment : undefined}
                            className={`border-b border-gray-200 px-2.5 py-1.5 text-gray-900 ${
                              c.num ? "text-right font-bold tabular-nums" : ""
                            } ${isCliente ? "whitespace-normal font-medium" : ""} ${c.key === "origine" ? "text-gray-500" : ""}`}
                            style={frozenStyle(c, cellBg, {
                              zIndex: 1,
                              boxShadow: c.last ? "4px 0 6px -4px rgba(0,0,0,.28)" : undefined,
                            })}
                          >
                            {value}
                          </td>
                        );
                      })}
                      {Array.from({ length: 12 }).map((_, i) => {
                        const states = r._cellStates?.[i] || [];
                        let style: CSSProperties = {};
                        let title: string | undefined;
                        if (states.length === 1) {
                          style = { background: STATE_COLOR[states[0].stato || ""] || "transparent" };
                        } else if (states.length > 1) {
                          const sorted = [...states].sort((a, b) => b.val - a.val);
                          const c1 = STATE_COLOR[sorted[0].stato || ""] || "transparent";
                          const c2 = STATE_COLOR[(sorted[1] || sorted[0]).stato || ""] || c1;
                          style = { background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)` };
                          title = states.map((s) => `${s.stato}: ${fmt(s.val)}`).join(" + ");
                        }
                        return (
                          <td key={i} className="border-b border-gray-200 px-2.5 py-1.5 text-right tabular-nums text-gray-900" style={style} title={title}>
                            {fmt(r.months[i])}
                          </td>
                        );
                      })}
                      <td className="border-b border-gray-200 px-2.5 py-1.5 text-right font-bold tabular-nums text-gray-900">{fmt(r.totale)}</td>
                      <td className="whitespace-normal border-b border-gray-200 px-2.5 py-1.5 text-[11.5px] text-amber-700">{nota || ""}</td>
                    </tr>
                  );
                })}

                <tr>
                  <td
                    colSpan={cols.length - 1}
                    className="px-2.5 py-2 font-bold text-white"
                    style={{ position: "sticky", left: 0, width: cols.slice(0, -1).reduce((s, x) => s + x.width, 0), background: TOTAL_BG }}
                  >
                    {plActive ? `TOTALE ${plFilter.toUpperCase()}` : "TOTALE GENERALE"}
                  </td>
                  <td
                    className="px-2.5 py-2 text-right font-bold tabular-nums text-white"
                    style={frozenStyle(cols[cols.length - 1], TOTAL_BG, { boxShadow: "4px 0 6px -4px rgba(0,0,0,.28)" })}
                  >
                    {fmt(totals.ordinato)}
                  </td>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <td key={i} className="px-2.5 py-2 text-right font-bold tabular-nums text-white" style={{ background: TOTAL_BG }}>
                      {fmt(totals.months[i])}
                    </td>
                  ))}
                  <td className="px-2.5 py-2 font-bold tabular-nums text-white" style={{ background: TOTAL_BG }}>
                    {fmt(totals.totale)}
                  </td>
                  <td style={{ background: TOTAL_BG }} />
                </tr>
              </tbody>
            </table>
          </div>

          {!plActive && doc.stato_summary?.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <h2 className="border-b border-gray-200 px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Riepilogo per stato</h2>
              <div className="overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-[12.5px]">
                  <thead>
                    <tr>
                      <th className="px-2.5 py-2 text-left font-semibold text-white" style={{ background: HEADER_BG }}>
                        Stato
                      </th>
                      {MESI.map((m) => (
                        <th key={m} className="px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                          {m}
                        </th>
                      ))}
                      <th className="px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                        Totale {doc.year}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.stato_summary.map((s) => (
                      <tr key={s.stato}>
                        <td className="border-b border-gray-100 px-2.5 py-1.5 font-semibold" style={{ background: `${s.color}22` }}>
                          {s.stato}
                        </td>
                        {s.months.map((v, i) => (
                          <td key={i} className="border-b border-gray-100 px-2.5 py-1.5 text-right tabular-nums" style={{ background: v ? `${s.color}33` : undefined }}>
                            {fmt(v)}
                          </td>
                        ))}
                        <td className="border-b border-gray-100 px-2.5 py-1.5 text-right font-bold tabular-nums" style={{ background: `${s.color}33` }}>
                          {fmt(s.totale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!plActive && doc.target_table?.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <h2 className="border-b border-gray-200 px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Target {doc.year}</h2>
              <div className="overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-[12.5px]">
                  <thead>
                    <tr>
                      <th className="px-2.5 py-2 text-left font-semibold text-white" style={{ background: HEADER_BG }}>
                        Cliente
                      </th>
                      <th className="px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                        Ordinato
                      </th>
                      <th className="px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                        Target
                      </th>
                      <th className="px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                        Differenza
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.target_table.map((t, i) => {
                      const totOrd = doc.target_table.reduce((s, x) => s + (x.ordinato || 0), 0);
                      const totTgt = doc.target_table.reduce((s, x) => s + (x.target || 0), 0);
                      const totDiff = doc.target_table.reduce((s, x) => s + (x.differenza || 0), 0);
                      const isLast = i === doc.target_table.length - 1;
                      return (
                        <Fragment key={t.cliente ?? t.label ?? i}>
                          <tr>
                            <td className="whitespace-normal border-b border-gray-100 px-2.5 py-1.5 font-medium">{t.cliente || t.label || "Altri"}</td>
                            <td className="border-b border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{fmt(t.ordinato)}</td>
                            <td className="border-b border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{fmt(t.target)}</td>
                            <td
                              className={`border-b border-gray-100 px-2.5 py-1.5 text-right font-bold tabular-nums ${
                                t.differenza > 0 ? "text-emerald-700" : t.differenza < 0 ? "text-red-700" : ""
                              }`}
                            >
                              {fmtSigned(t.differenza)}
                            </td>
                          </tr>
                          {isLast && (
                            <tr className="font-bold text-white" style={{ background: TOTAL_BG }}>
                              <td className="px-2.5 py-1.5">TOTALE</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums">{fmt(totOrd)}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums">{fmt(totTgt)}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtSigned(totDiff)}</td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RevenueSummaryPanel({ doc, plActive, plFilter }: { doc: PipelineDoc; plActive: boolean; plFilter: string }) {
  const rs = doc.revenue_summary!;
  let steps: RevenueStep[] = rs.steps;
  let scopeLabel = "";
  let plNote = "";
  if (plActive) {
    const byPl = rs.by_project_leader || {};
    if (byPl[plFilter]) {
      steps = byPl[plFilter];
      scopeLabel = ` — ${plFilter}`;
    } else {
      plNote = ` — dettaglio non disponibile per ${plFilter}: mostrato il totale aziendale.`;
    }
  }
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <h2 className="border-b border-gray-200 px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Previsione fatturato {rs.year}
        {scopeLabel}
      </h2>
      <div className="flex flex-wrap items-center gap-1.5 p-3.5">
        {steps.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="flex min-w-[20px] items-center justify-center text-base font-bold text-gray-400">{s.op === "-" ? "−" : s.op === "=" ? "=" : "+"}</span>}
            <span
              className={`flex min-w-[118px] flex-col justify-center rounded-md px-3 py-2 ${
                s.highlight ? "bg-violet-700 text-white" : s.bold ? "bg-violet-50" : "bg-gray-50"
              }`}
            >
              <span className={`text-[10.5px] uppercase tracking-wide leading-tight ${s.highlight ? "text-violet-100" : "text-gray-500"}`}>{s.label}</span>
              <span className="text-[15px] font-bold tabular-nums">{fmt(s.value)}</span>
            </span>
          </span>
        ))}
      </div>
      {(rs.source_note || plNote) && (
        <p className="-mt-1 px-3.5 pb-3 text-[11.5px] text-gray-500">
          {rs.source_note}
          {plNote}
        </p>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="mb-3.5 flex flex-wrap gap-2">
      {Object.entries(STATE_COLOR).map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11.5px] text-gray-500">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
