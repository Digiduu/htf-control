import { fmtDays, fmtEUR, fmtMonth, isLowRevenueRate } from "../lib/logic";
import type { MonthColumn } from "../lib/types";

// Contenuto di una cella mese del calendario (prompt di handoff §5.3, punto
// "Contenuto di ogni cella mese", e §9 "Card mese... con una barra colorata
// in alto"): usato sia dalla tabella principale (una colonna per mese, un
// progetto/cliente per riga) sia dalla pagina di dettaglio progetto (stessa
// logica, una sola riga). Ogni mese è una card con bordo ben visibile (non
// solo una linea di separazione) per renderla riconoscibile a colpo d'occhio.
export default function MonthCell({ column }: { column: MonthColumn }) {
  const hasEmesso = column.fatturatoEmesso !== 0;
  const hasBozza = column.fatturatoBozza !== 0;
  const lowRevenue = isLowRevenueRate(column.ricavoMedioMese);
  const milestoneInfo = milestoneInfoOf(column.milestones);

  const topBarClass = hasEmesso ? "bg-emerald-500" : hasBozza ? "bg-blue-400" : "bg-gray-100";
  const cardBorderClass = milestoneInfo
    ? milestoneInfo.cardBorder
    : column.fineProgetto
      ? "border-amber-400"
      : "border-gray-200";

  return (
    <div className="w-28 shrink-0 p-1">
      <div
        className={`relative h-full overflow-hidden rounded-md border bg-white ${cardBorderClass} ${
          column.isCurrent ? "bg-violet-50/70" : column.isFuture ? "bg-gray-50" : ""
        }`}
        title={column.invoiceTooltip.length ? column.invoiceTooltip.join(", ") : undefined}
      >
        <div className={`h-0.75 w-full ${topBarClass}`} />

        {milestoneInfo && (
          <span
            className={`absolute right-1 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${milestoneInfo.badge}`}
            title={milestoneInfo.tooltip}
          >
            ◆{milestoneInfo.count > 1 ? `×${milestoneInfo.count}` : ""}
            {milestoneInfo.beyondEnd ? "!" : ""}
          </span>
        )}

        <div className="space-y-0.5 px-1.5 pb-1.5 pt-1 text-[10.5px] leading-tight">
          <div className="font-mono tabular-nums">
            {hasEmesso ? (
              <span className="font-semibold text-emerald-700">{fmtEUR(column.fatturatoEmesso)}</span>
            ) : hasBozza ? (
              <span className="font-semibold text-blue-600">prev.</span>
            ) : (
              <span className="text-gray-300">—</span>
            )}
            {hasEmesso && hasBozza && <span className="ml-1 text-[9px] font-semibold text-blue-500">+prev.</span>}
          </div>

          {column.giornateRegistrate != null && <div className="text-gray-500">{fmtDays(column.giornateRegistrate)} gg</div>}
          {column.giornatePianificate != null && <div className="text-gray-400">pian. {fmtDays(column.giornatePianificate)} gg</div>}
          {column.isFutureBucket && <div className="text-gray-400">da {fmtMonth(column.month)}</div>}

          {column.ricavoMedioMese != null && (
            <div className={`flex items-center gap-1 border-t border-dashed border-gray-200 pt-0.5 font-mono tabular-nums ${lowRevenue ? "font-semibold text-red-600" : "text-gray-500"}`}>
              {fmtEUR(column.ricavoMedioMese)}/gg
              {lowRevenue && <span aria-hidden>●</span>}
            </div>
          )}
          {column.ricavoMedioCumulato != null && (
            <div className="font-mono italic tabular-nums text-gray-400">cum. {fmtEUR(column.ricavoMedioCumulato)}/gg</div>
          )}

          {column.fineProgetto && (
            <div className="pt-0.5">
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800" title="Fine progetto">
                ◆ fine{column.fineProgettoLabel ? ` ${column.fineProgettoLabel}` : ""}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Colore del marcatore/bordo milestone (§5.3): rosso se scaduta e non
// raggiunta (prevale sugli altri, anche come bordo dell'intera card), verde
// solo se TUTTE le milestone del mese sono raggiunte, viola negli altri casi
// (scadenza futura non raggiunta, o un misto senza scadute). "×N" se più
// milestone cadono nello stesso mese, "!" se la scadenza è successiva alla
// fine progetto.
function milestoneInfoOf(milestones: MonthColumn["milestones"]) {
  if (!milestones.length) return null;
  const hasOverdue = milestones.some((m) => m.isOverdue);
  const allReached = milestones.every((m) => m.isReached);
  const badge = hasOverdue ? "bg-red-100 text-red-800" : allReached ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800";
  const cardBorder = hasOverdue ? "border-red-300" : allReached ? "border-emerald-300" : "border-violet-300";
  const beyondEnd = milestones.some((m) => m.isBeyondEnd);
  const tooltip = milestones.map((m) => `${m.name}: ${m.isReached ? "raggiunta" : (m.deadline ?? "senza data")}`).join(" · ");
  return { badge, cardBorder, beyondEnd, tooltip, count: milestones.length };
}
