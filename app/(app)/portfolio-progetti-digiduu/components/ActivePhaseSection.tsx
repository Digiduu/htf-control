import { Kpi, KpiGrid } from "../../report-progetti/components/Kpis";
import { fmtDate } from "../lib/logic";
import type { ActivePhaseProject, ActivePhaseSummary } from "../lib/types";

// "Progetti attivi per fase" (prompt di handoff §6.3), dentro il Recap
// globale: a differenza del resto del modulo conta i singoli progetti Odoo,
// non i gruppi/progetti padre (un progetto padre può unire più progetti con
// fase diversa) — vedi la nota nel sottotitolo, ripresa dal prompt originale.
export default function ActivePhaseSection({ summary, dataAsOf }: { summary: ActivePhaseSummary; dataAsOf: string | null }) {
  const { totals, byPl, daFareList, inCorsoList, contrattiAssistenzaList, affiancamentiList } = summary;

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold text-gray-900">Progetti attivi per fase</h2>
      <p className="mt-1 max-w-2xl text-sm text-gray-500">
        Conteggio dei singoli progetti Odoo (non delle righe del report, che possono unire più progetti){" "}
        <b>non archiviati</b> in fase <b>&quot;Da fare&quot;</b> o <b>&quot;In corso&quot;</b>
        {dataAsOf ? ` al ${fmtDate(dataAsOf)}` : ""}. &quot;Assistenza&quot; = progetti con l&apos;etichetta Odoo{" "}
        <b>Assistenza</b> tra le loro etichette.
      </p>

      <KpiGrid>
        <Kpi label="Progetti attivi" value={String(totals.attivi)} sub={`${totals.daFare} da fare · ${totals.inCorso} in corso`} />
        <Kpi label="Da fare" value={String(totals.daFare)} sub={`${totals.daFareAssistenza} con etichetta Assistenza`} />
        <Kpi label="In corso" value={String(totals.inCorso)} sub={`${totals.inCorsoAssistenza} con etichetta Assistenza`} />
        <Kpi
          label="Con etichetta Assistenza"
          value={String(totals.assistenza)}
          sub={`${totals.assistenzaPct}% dei progetti attivi`}
          accent
        />
      </KpiGrid>

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="border-b border-gray-200 px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Project Leader
              </th>
              <th className="border-b border-l border-gray-200 px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                Da fare
              </th>
              <th className="border-b border-l border-gray-200 px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                di cui Assistenza
              </th>
              <th className="border-b border-l border-gray-200 px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                In corso
              </th>
              <th className="border-b border-l border-gray-200 px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                di cui Assistenza
              </th>
              <th className="border-b border-l border-gray-200 px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                Totale
              </th>
              <th className="border-b border-l border-gray-200 px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                di cui Assistenza
              </th>
            </tr>
          </thead>
          <tbody>
            {byPl.map((row) => (
              <tr key={row.plName} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3.5 py-2.5 font-medium text-gray-900">{row.plName}</td>
                <Cell value={row.daFare} muted={row.daFare === 0} />
                <Cell value={row.daFareAssistenza} muted={row.daFareAssistenza === 0} accent />
                <Cell value={row.inCorso} muted={row.inCorso === 0} />
                <Cell value={row.inCorsoAssistenza} muted={row.inCorsoAssistenza === 0} accent />
                <Cell value={row.totale} bold />
                <Cell value={row.totaleAssistenza} accent />
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-900">
              <td className="px-3.5 py-2.5">Totale</td>
              <Cell value={totals.daFare} bold />
              <Cell value={totals.daFareAssistenza} bold accent />
              <Cell value={totals.inCorso} bold />
              <Cell value={totals.inCorsoAssistenza} bold accent />
              <Cell value={totals.attivi} bold />
              <Cell value={totals.assistenza} bold accent />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ExpandableList title="Da fare" items={daFareList} />
        <ExpandableList title="In corso" items={inCorsoList} />
        <ExpandableList title="Con etichetta Assistenza — contratti di assistenza" items={contrattiAssistenzaList} />
        <ExpandableList title="Con etichetta Assistenza — affiancamenti e altri progetti" items={affiancamentiList} />
      </div>
    </div>
  );
}

function Cell({ value, muted, bold, accent }: { value: number; muted?: boolean; bold?: boolean; accent?: boolean }) {
  return (
    <td
      className={`border-l border-gray-100 px-3.5 py-2.5 text-right tabular-nums ${
        bold ? "font-semibold text-gray-900" : muted ? "text-gray-300" : accent ? "font-medium text-violet-700" : "text-gray-700"
      }`}
    >
      {value}
    </td>
  );
}

function ExpandableList({ title, items }: { title: string; items: ActivePhaseProject[] }) {
  return (
    <details className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
        {title}
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{items.length}</span>
      </summary>
      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-xs text-gray-600">
        {items.length === 0 ? (
          <li className="italic text-gray-400">Nessun progetto.</li>
        ) : (
          items.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-2 border-t border-gray-100 pt-1 first:border-t-0 first:pt-0">
              <span className="text-gray-800">{p.projectName}</span>
              <span className="shrink-0 whitespace-nowrap text-gray-400">{p.plName}</span>
            </li>
          ))
        )}
      </ul>
    </details>
  );
}
