import { Fragment } from "react";
import type { GiornateBlock } from "../lib/types";

export default function GiornateSection({ intro, blocks }: { intro: string; blocks: GiornateBlock[] }) {
  return (
    <section id="analisi-giornate" className="mt-10 border-t-4 border-amber-500 pt-4">
      <h2 className="font-serif text-lg font-semibold text-amber-700">
        Analisi giornate: ordinato vs registrato vs fatturato (consulenti esterni/a incarico)
      </h2>
      <p className="mb-3 max-w-3xl text-xs text-gray-500">{intro}</p>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="border-b border-gray-200 px-3 py-2 text-left font-semibold">Progetto</th>
              <th className="border-b border-l border-gray-200 px-3 py-2 text-left font-semibold">PM</th>
              <th className="border-b border-l border-gray-200 px-3 py-2 text-left font-semibold">Consulente esterno</th>
              <th className="border-b border-l border-gray-200 px-3 py-2 text-right font-semibold">Ordinato (gg)</th>
              <th className="border-b border-l border-gray-200 px-3 py-2 text-right font-semibold">Registrato — foglio ore (gg)</th>
              <th className="border-b border-l border-gray-200 px-3 py-2 text-right font-semibold">Fatturato da fornitore (gg)</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block) => (
              <Fragment key={block.strategist}>
                <tr className="bg-orange-50">
                  <td colSpan={6} className="px-3 py-1.5 font-semibold text-orange-700">
                    {block.strategist}
                  </td>
                </tr>
                {block.rows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 align-top">
                      <span className="font-mono text-[11px] text-gray-500">{r.codice}</span>
                      <br />
                      <span className="text-gray-700">{r.progetto}</span>
                    </td>
                    <td className="border-l border-gray-100 px-3 py-1.5 align-top text-gray-700">{r.pm}</td>
                    <td className="border-l border-gray-100 px-3 py-1.5 align-top text-gray-700">{r.consulente}</td>
                    <td className="border-l border-gray-100 px-3 py-1.5 text-right align-top tabular-nums text-gray-700">{r.ordinato}</td>
                    <td className="border-l border-gray-100 px-3 py-1.5 text-right align-top tabular-nums text-gray-700">{r.registrato}</td>
                    <td
                      className={`border-l border-gray-100 px-3 py-1.5 text-right align-top tabular-nums ${
                        r.fatturatoTone === "over"
                          ? "bg-red-50 font-semibold text-red-700"
                          : r.fatturatoTone === "under"
                            ? "bg-amber-50 font-semibold text-amber-700"
                            : "text-gray-700"
                      }`}
                      title={r.fatturatoTitle}
                    >
                      {r.fatturato}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-red-500 align-middle" /> fatturato dal fornitore superiore al
        registrato a foglio ore (da verificare) &nbsp;&nbsp;
        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-500 align-middle" /> registrato superiore al fatturato
        (lavoro non ancora fatturato)
      </p>
    </section>
  );
}
