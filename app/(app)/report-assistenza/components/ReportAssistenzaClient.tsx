"use client";

import { useMemo, useState } from "react";
import type { AssistenzaDoc } from "../lib/types";
import {
  MESI_LUNGHI,
  contractMonths,
  cumulativeTotals,
  emptyMonth,
  fmtDate,
  fmtEur,
  fmtOre,
  periodTotals,
  ricavoMedioGg,
  semaforo,
  semaforoLabel,
  type Semaforo,
} from "../lib/logic";

const HEADER_BG = "#3d4a55";
const TOTAL_BG = "#44546a";

const SEMAFORO_COLOR: Record<Semaforo, string> = {
  rosso: "#dc2626",
  arancione: "#f59e0b",
  verde: "#16a34a",
  nd: "#cbd5e1",
};
const SEMAFORO_ORDER: Record<Semaforo, number> = { rosso: 0, arancione: 1, verde: 2, nd: 3 };

export default function ReportAssistenzaClient({ doc }: { doc: AssistenzaDoc }) {
  const today = new Date();
  const years = useMemo(() => {
    const set = new Set<number>([today.getFullYear()]);
    for (const p of doc.projects) for (const ym of Object.keys(p.months)) set.add(Number(ym.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);
  const clients = useMemo(
    () => [...new Set(doc.projects.map((p) => p.cliente || "—"))].sort((a, b) => a.localeCompare(b, "it")),
    [doc]
  );

  const [year, setYear] = useState(today.getFullYear());
  // null = tutto l'anno
  const [month, setMonth] = useState<number | null>(today.getMonth() + 1);
  const [client, setClient] = useState("");

  const rows = useMemo(() => {
    return doc.projects
      .filter((p) => !client || (p.cliente || "—") === client)
      .map((p) => {
        const sem = semaforo(p.date_end, today);
        const period = periodTotals(p, year, month);
        const cumul = cumulativeTotals(p, year, month);
        const cm = contractMonths(p);
        return {
          p,
          sem,
          period,
          cumul,
          orePrevisteMese: cm && p.ore_previste ? p.ore_previste / cm : null,
          rmMese: ricavoMedioGg(period),
          rmCumul: ricavoMedioGg(cumul),
        };
      })
      .sort(
        (a, b) =>
          SEMAFORO_ORDER[a.sem.stato] - SEMAFORO_ORDER[b.sem.stato] ||
          (a.p.date_end || "9999").localeCompare(b.p.date_end || "9999") ||
          (a.p.cliente || "").localeCompare(b.p.cliente || "", "it")
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, year, month, client]);

  const totals = useMemo(() => {
    const period = emptyMonth();
    const cumul = emptyMonth();
    for (const r of rows) {
      for (const k of Object.keys(period) as (keyof typeof period)[]) {
        period[k] += r.period[k];
        cumul[k] += r.cumul[k];
      }
    }
    return { period, cumul, rmMese: ricavoMedioGg(period), rmCumul: ricavoMedioGg(cumul) };
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<Semaforo, number> = { rosso: 0, arancione: 0, verde: 0, nd: 0 };
    for (const r of rows) c[r.sem.stato]++;
    return c;
  }, [rows]);

  const periodLabel = month ? `${MESI_LUNGHI[month - 1]} ${year}` : `Anno ${year}`;
  const th = "sticky top-0 z-10 px-2.5 py-2 font-semibold text-white";
  const td = "border-b border-gray-200 px-2.5 py-1.5";

  return (
    <>
      <div className="mb-1">
        <h1 className="text-xl font-semibold text-gray-900">Report Assistenza</h1>
        <p className="mt-1 text-sm text-gray-500">
          Digiduu · dati Odoo al {fmtDate(doc.data_as_of)} · {doc.projects.length} progetti di assistenza in corso
        </p>
      </div>

      <div className="mb-4 mt-4 flex flex-wrap items-center gap-2.5">
        <select
          value={month ?? ""}
          onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none"
        >
          <option value="">Tutto l&apos;anno</option>
          {MESI_LUNGHI.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={client}
          onChange={(e) => setClient(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none"
        >
          <option value="">Tutti i clienti</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        <div className="flex flex-wrap gap-2 text-[11.5px] text-gray-600">
          {(
            [
              ["rosso", "Ultimo mese"],
              ["arancione", "Penultimo / terzultimo mese"],
              ["verde", "Oltre 3 mesi"],
              ["nd", "Senza data di fine"],
            ] as [Semaforo, string][]
          ).map(([s, label]) => (
            <span key={s} className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1">
              <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SEMAFORO_COLOR[s] }} />
              {label} <b className="tabular-nums">{counts[s]}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-gray-200 shadow-sm" style={{ maxHeight: "75vh" }}>
        <table className="w-full border-separate border-spacing-0 whitespace-nowrap text-[12.5px]">
          <thead>
            <tr>
              <th className={`${th} w-8`} style={{ background: HEADER_BG }} />
              <th className={`${th} text-left`} style={{ background: HEADER_BG }}>Cliente</th>
              <th className={`${th} text-left`} style={{ background: HEADER_BG }}>Progetto</th>
              <th className={`${th} text-left`} style={{ background: HEADER_BG }} title="Project Leader del contatto cliente">PL</th>
              <th className={`${th} text-right`} style={{ background: HEADER_BG }}>Inizio</th>
              <th className={`${th} text-right`} style={{ background: HEADER_BG }}>Fine prevista</th>
              <th className={`${th} text-right`} style={{ background: HEADER_BG }} title="Campo Ore previste nella testata del progetto, e stima al mese sulla durata del contratto">
                Ore previste
              </th>
              <th className={`${th} text-right`} style={{ background: HEADER_BG }}>
                Fatturato
                <br />
                <span className="text-[10px] font-normal text-gray-300">{periodLabel}</span>
              </th>
              <th className={`${th} text-right`} style={{ background: HEADER_BG }}>
                Ore spese
                <br />
                <span className="text-[10px] font-normal text-gray-300">{periodLabel}</span>
              </th>
              <th className={`${th} text-right`} style={{ background: HEADER_BG }} title="Fatturato del periodo diviso le giornate spese (ore / 8)">
                Ricavo medio gg
                <br />
                <span className="text-[10px] font-normal text-gray-300">{month ? "mese" : "anno"}</span>
              </th>
              <th
                className={`${th} text-right`}
                style={{ background: HEADER_BG }}
                title="Fatturato e giornate cumulati dall'inizio dei dati fino alla fine del periodo scelto: utile con i canoni fatturati a trimestre"
              >
                Ricavo medio gg
                <br />
                <span className="text-[10px] font-normal text-gray-300">cumulato</span>
              </th>
              <th className={`${th} text-right`} style={{ background: HEADER_BG }} title="Da definire: come calcolarlo lo decidiamo più avanti">
                Tempo chiusura ticket
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, sem, period, cumul, orePrevisteMese, rmMese, rmCumul }, i) => {
              const bg = i % 2 === 0 ? "#ffffff" : "#fafaf8";
              const overBudget = orePrevisteMese !== null && month !== null && period.ore > orePrevisteMese + 0.01;
              return (
                <tr key={p.id} style={{ background: bg }}>
                  <td className={`${td} text-center`} title={semaforoLabel(p.date_end, today)}>
                    <i className="inline-block h-3 w-3 rounded-full" style={{ background: SEMAFORO_COLOR[sem.stato] }} />
                  </td>
                  <td className={`${td} whitespace-normal font-medium text-gray-900`}>{p.cliente || "—"}</td>
                  <td className={`${td} max-w-[320px] overflow-hidden text-ellipsis text-gray-700`} title={`${p.nome}${p.ordine ? ` · ordine ${p.ordine}` : " · senza ordine di vendita"}`}>
                    {p.nome}
                    {!p.ordine && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">senza ordine</span>}
                  </td>
                  <td className={`${td} text-gray-700`}>{p.project_leader || <span className="text-gray-400">—</span>}</td>
                  <td className={`${td} text-right tabular-nums text-gray-700`}>{fmtDate(p.date_start)}</td>
                  <td className={`${td} text-right tabular-nums font-semibold`} style={{ color: sem.stato === "rosso" ? "#b91c1c" : sem.stato === "arancione" ? "#b45309" : undefined }}>
                    {fmtDate(p.date_end)}
                  </td>
                  <td className={`${td} text-right tabular-nums text-gray-900`}>
                    {fmtOre(p.ore_previste) || <span className="text-gray-400">—</span>}
                    {orePrevisteMese !== null && <div className="text-[10.5px] text-gray-500">≈ {fmtOre(orePrevisteMese)} h/mese</div>}
                  </td>
                  <td className={`${td} text-right tabular-nums text-gray-900`}>
                    {fmtEur(period.fatturato)}
                    {period.fatturato_bozza !== 0 && <div className="text-[10.5px] text-gray-500">di cui bozza {fmtEur(period.fatturato_bozza)}</div>}
                  </td>
                  <td className={`${td} text-right tabular-nums ${overBudget ? "font-semibold text-red-700" : "text-gray-900"}`} title={overBudget ? "Più ore delle ore previste al mese" : undefined}>
                    {fmtOre(period.ore)}
                    {period.ore_senza_ordine !== 0 && <div className="text-[10.5px] font-normal text-gray-500">di cui senza ordine {fmtOre(period.ore_senza_ordine)}</div>}
                  </td>
                  <td className={`${td} text-right tabular-nums font-semibold text-gray-900`}>{fmtEur(rmMese)}</td>
                  <td className={`${td} text-right tabular-nums text-gray-900`} title={`Cumulato: ${fmtEur(cumul.fatturato) || "0 €"} su ${fmtOre(cumul.ore) || "0"} ore`}>
                    {fmtEur(rmCumul)}
                  </td>
                  <td className={`${td} text-right text-gray-400`} />
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="p-8 text-center text-sm text-gray-500">
                  Nessun progetto per i filtri scelti.
                </td>
              </tr>
            )}
            <tr className="font-bold text-white" style={{ background: TOTAL_BG }}>
              <td className="px-2.5 py-2" colSpan={7}>
                TOTALE · {rows.length} progetti
              </td>
              <td className="px-2.5 py-2 text-right tabular-nums">{fmtEur(totals.period.fatturato)}</td>
              <td className="px-2.5 py-2 text-right tabular-nums">{fmtOre(totals.period.ore)}</td>
              <td className="px-2.5 py-2 text-right tabular-nums">{fmtEur(totals.rmMese)}</td>
              <td className="px-2.5 py-2 text-right tabular-nums">{fmtEur(totals.rmCumul)}</td>
              <td className="px-2.5 py-2" />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        {doc.source_note} Fatturato = fatture cliente (confermate e in bozza) imputate al progetto, per data della fattura. Ore = foglio ore sul progetto, comprese
        quelle senza ordine di vendita. Ricavo medio gg = fatturato / (ore ÷ 8).
      </p>
    </>
  );
}
