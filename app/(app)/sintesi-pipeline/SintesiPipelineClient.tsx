"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import type { Company, PipelineDoc } from "../pipeline-commerciale/lib/types";
import { fmt, statoTotale } from "../pipeline-commerciale/lib/pipeline-logic";

const COMPANIES: Company[] = ["oriens", "digiduu"];

const COMPANY_LABEL: Record<Company, string> = {
  oriens: "Oriens Consulting",
  digiduu: "Digiduu",
};

// Ogni riga guarda un singolo stato di doc.stato_summary (stato: null usa
// invece doc.overall.totale, il totale di tutti gli stati della generazione).
const COLUMNS: { key: string; label: string; stato: string | null }[] = [
  { key: "bozza", label: "Bozza", stato: "Bozza - Contrattualizzato" },
  { key: "fatturato", label: "Fatturato", stato: "Confermata - Fatturato" },
  { key: "probabile", label: "Previsto Probabile", stato: "Previsione - Probabile" },
  { key: "possibile", label: "Previsto Possibile", stato: "Previsione - Possibile" },
  { key: "consuntivi", label: "Consuntivi", stato: "Consuntivi" },
  { key: "totale", label: "Totale anno", stato: null },
];

const HEADER_BG = "#3d4a55";
const TOTAL_BG = "#44546a";
const STRIPE = "#fafaf8";

function fmtDateLabel(iso: string) {
  try {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
}

// "–" quando lo stato non esiste affatto in questa generazione (es. schema
// precedente allo split Probabile/Possibile) o manca del tutto la
// generazione per quell'azienda in questa data — diverso da fmt(), che mostra
// "" per un valore presente ma pari a zero, coerente col resto del sito.
function fmtOrDash(v: number | null | undefined) {
  return v === null || v === undefined ? "–" : fmt(v);
}

function statoOrOverall(doc: PipelineDoc, col: { stato: string | null }): number | null {
  return col.stato ? statoTotale(doc, col.stato) : (doc.overall?.totale ?? null);
}

export default function SintesiPipelineClient() {
  const supabase = useMemo(() => createClient(), []);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [docsByCompany, setDocsByCompany] = useState<Partial<Record<Company, PipelineDoc>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Elenco date storiche disponibili (unione tra le due aziende, che nella
  // pratica generano nella stessa data ma potrebbero non farlo sempre):
  // selezione di default sull'ultima disponibile.
  useEffect(() => {
    let cancelled = false;
    async function loadDates() {
      setError(null);
      const { data, error: err } = await supabase.from("pipeline_generations").select("date").order("date", { ascending: true });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const uniqueDates = [...new Set((data || []).map((r) => r.date as string))].sort();
      setDates(uniqueDates);
      if (uniqueDates.length) {
        setSelectedDate(uniqueDates[uniqueDates.length - 1]);
      } else {
        setLoading(false);
      }
    }
    loadDates();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Documenti di entrambe le aziende per la data selezionata: se una delle
  // due non ha una generazione esattamente in quella data, resta assente e la
  // riga lo segnala invece di bloccare la pagina.
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    async function loadDocs() {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase.from("pipeline_generations").select("company, data").eq("date", selectedDate);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const byCompany: Partial<Record<Company, PipelineDoc>> = {};
      for (const row of data || []) {
        byCompany[row.company as Company] = row.data as PipelineDoc;
      }
      setDocsByCompany(byCompany);
      setLoading(false);
    }
    loadDocs();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const descDates = useMemo(() => [...dates].reverse(), [dates]);

  const totals = useMemo(() => {
    const row: Record<string, number | null> = {};
    for (const col of COLUMNS) {
      let sum = 0;
      let anyValue = false;
      for (const c of COMPANIES) {
        const doc = docsByCompany[c];
        if (!doc) continue;
        const v = statoOrOverall(doc, col);
        if (v !== null) {
          sum += v;
          anyValue = true;
        }
      }
      row[col.key] = anyValue ? sum : null;
    }
    return row;
  }, [docsByCompany]);

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Sintesi Pipeline</h1>
        <p className="mt-1 text-sm text-gray-500">
          Riepilogo per stato di Oriens Consulting e Digiduu, generazione per generazione.
          {loading ? " Caricamento…" : ""}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
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
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Errore nel leggere i dati: {error}</div>
      )}

      {!loading && !error && descDates.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Nessuna generazione storica disponibile.
        </div>
      )}

      {descDates.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
          <table className="w-full border-separate border-spacing-0 text-[12.5px]">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-white" style={{ background: HEADER_BG }}>
                  Azienda
                </th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPANIES.map((c, i) => {
                const doc = docsByCompany[c];
                const rowBg = i % 2 === 0 ? "#ffffff" : STRIPE;
                return (
                  <tr key={c}>
                    <td className="border-b border-gray-200 px-3 py-2 font-medium text-gray-900" style={{ background: rowBg }}>
                      {COMPANY_LABEL[c]}
                      {!doc && <span className="ml-2 text-xs font-normal text-gray-400">nessuna generazione in questa data</span>}
                    </td>
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`border-b border-gray-200 px-3 py-2 text-right tabular-nums text-gray-900 ${
                          col.key === "totale" ? "font-bold" : ""
                        }`}
                        style={{ background: rowBg }}
                      >
                        {fmtOrDash(doc ? statoOrOverall(doc, col) : null)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td className="px-3 py-2 font-bold text-white" style={{ background: TOTAL_BG }}>
                  Totale
                </td>
                {COLUMNS.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-right font-bold tabular-nums text-white" style={{ background: TOTAL_BG }}>
                    {fmtOrDash(totals[col.key])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
