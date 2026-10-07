import type { Progetto } from "../lib/types";

export default function ProjectCard({ progetto: p }: { progetto: Progetto }) {
  return (
    <details className="group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2.5 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <span className="text-gray-400 transition-transform group-open:rotate-90">▸</span>
        <span className="rounded bg-orange-50 px-1.5 py-0.5 font-mono text-[11px] text-orange-700">{p.codice}</span>
        <span className="font-semibold text-gray-900">{p.nome}</span>
        <span className="text-gray-500">{p.cliente}</span>
        <span className="text-xs italic text-gray-400">{p.stato}</span>
        <span className="ml-auto flex items-center gap-2 whitespace-nowrap font-mono text-xs text-gray-700">
          <b>{p.fatturatoLabel}</b> fatt. ·<span className={p.margineNeg ? "text-red-600" : ""}>{p.margineLabel}</span> margine
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              p.dedicatedReport
                ? "bg-orange-50 text-orange-700"
                : p.nAnomalie > 0
                  ? "bg-amber-100 text-amber-800"
                  : "bg-orange-50 text-orange-700"
            }`}
          >
            {p.dedicatedReport ? "report dedicato" : `${p.nAnomalie} anomalie`}
          </span>
        </span>
      </summary>
      <div className="border-t border-gray-100 px-4 pb-4 pt-3">
        {p.dedicatedReport ? (
          <>
            <p className="text-sm text-gray-700">{p.dedicatedReport.nota}</p>
            <a
              href={p.dedicatedReport.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-sm font-semibold text-orange-700 hover:underline"
            >
              Apri il report completo →
            </a>
          </>
        ) : (
          <>
            {p.bafo && p.bafo.length > 0 && (
              <>
                <h4 className="mb-1.5 mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Baseline / Actual / Bozza / Forecast
                </h4>
                <div className="mb-3 overflow-x-auto rounded-md border border-gray-200">
                  <table className="w-full min-w-[640px] border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="border-b border-gray-200 px-2.5 py-1.5 text-left font-semibold"></th>
                        <th className="border-b border-l border-gray-200 px-2.5 py-1.5 text-right font-semibold">Ricavi</th>
                        <th className="border-b border-l border-gray-200 px-2.5 py-1.5 text-right font-semibold">Giornate</th>
                        <th className="border-b border-l border-gray-200 px-2.5 py-1.5 text-right font-semibold">Ricavo medio/gg</th>
                        <th className="border-b border-l border-gray-200 px-2.5 py-1.5 text-right font-semibold">Costo</th>
                        <th className="border-b border-l border-gray-200 px-2.5 py-1.5 text-right font-semibold">Margine</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.bafo.map((r) => (
                        <tr key={r.riga} className="border-t border-gray-100">
                          <td className="px-2.5 py-1.5 font-medium text-gray-900">{r.riga}</td>
                          {r.nd ? (
                            <td colSpan={5} className="border-l border-gray-100 px-2.5 py-1.5 text-gray-400">
                              {r.nd}
                            </td>
                          ) : (
                            <>
                              <td className="border-l border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{r.ricavi}</td>
                              <td className="border-l border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{r.giornate}</td>
                              <td className="border-l border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{r.ricavoMedio}</td>
                              <td className="border-l border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{r.costo}</td>
                              <td className="border-l border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{r.margine}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {p.consulenti && p.consulenti.length > 0 && (
              <>
                <h4 className="mb-1.5 mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Per consulente</h4>
                <div className="mb-3 overflow-x-auto rounded-md border border-gray-200">
                  <table className="w-full min-w-[760px] border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="border-b border-gray-200 px-2.5 py-1.5 text-left font-semibold">Consulente</th>
                        <th className="border-b border-l border-gray-200 px-2.5 py-1.5 text-right font-semibold">Ordinate</th>
                        <th className="border-b border-l border-gray-200 px-2.5 py-1.5 text-right font-semibold">Registrate</th>
                        <th className="border-b border-l border-gray-200 px-2.5 py-1.5 text-right font-semibold">Fatturate</th>
                        <th className="border-b border-l border-gray-200 px-2.5 py-1.5 text-right font-semibold">Costo</th>
                        <th className="border-b border-l border-gray-200 px-2.5 py-1.5 text-right font-semibold">Ricavo pro-quota</th>
                        <th className="border-b border-l border-gray-200 px-2.5 py-1.5 text-right font-semibold">Margine</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.consulenti.map((c, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-2.5 py-1.5 font-medium text-gray-900">{c.consulente}</td>
                          <td className="border-l border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{c.ordinate}</td>
                          <td className="border-l border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{c.registrate}</td>
                          <td className="border-l border-gray-100 px-2.5 py-1.5 text-right tabular-nums">
                            {c.fatturateDq && (
                              <i
                                className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${
                                  c.fatturateDq === "ok" ? "bg-emerald-500" : "bg-amber-500"
                                }`}
                                title={c.fatturateDq === "ok" ? "foglio ore ≈ fatturato" : "foglio ore ≠ fatturato / da verificare"}
                              />
                            )}
                            {c.fatturate}
                          </td>
                          <td className="border-l border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{c.costo}</td>
                          <td className="border-l border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{c.ricavoProQuota}</td>
                          <td className="border-l border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{c.margine}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {p.altriCosti && p.altriCosti.length > 0 && (
              <div className="mb-3 text-xs text-gray-600">
                <p className="mb-1 font-semibold text-gray-500">Altri costi non ripartiti per consulente</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {p.altriCosti.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            <h4 className="mb-1.5 mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Anomalie e note metodologiche</h4>
            {p.anomalie && p.anomalie.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {p.anomalie.map((a, i) => (
                  <div key={i} className="rounded-r border-l-[3px] border-amber-400 bg-amber-50 px-2.5 py-1.5 text-xs text-gray-700">
                    {a}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Nessuna anomalia rilevata.</p>
            )}
            {p.nota && <p className="mt-2 text-xs italic text-gray-500">{p.nota}</p>}
          </>
        )}
      </div>
    </details>
  );
}
