import type { AssistenzaMonth, AssistenzaProject } from "./types";

export const MESI_LUNGHI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export type Semaforo = "rosso" | "arancione" | "verde" | "nd";

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

// Semaforo sulla data di fine prevista rispetto al mese di oggi: rosso
// nell'ultimo mese di contratto (o se già scaduto), arancione nel penultimo
// e terzultimo, verde prima. Senza data di fine: "nd".
export function semaforo(dateEnd: string | null, today = new Date()): { stato: Semaforo; mesiAllaFine: number | null } {
  if (!dateEnd) return { stato: "nd", mesiAllaFine: null };
  const diff = monthIndex(dateEnd) - (today.getFullYear() * 12 + today.getMonth());
  if (diff <= 0) return { stato: "rosso", mesiAllaFine: diff };
  if (diff <= 2) return { stato: "arancione", mesiAllaFine: diff };
  return { stato: "verde", mesiAllaFine: diff };
}

export function semaforoLabel(dateEnd: string | null, today = new Date()): string {
  const { stato, mesiAllaFine } = semaforo(dateEnd, today);
  if (stato === "nd") return "Data di fine non impostata";
  if (dateEnd! < today.toISOString().slice(0, 10)) return "Contratto scaduto";
  if (mesiAllaFine === 0) return "Ultimo mese di contratto";
  if (mesiAllaFine === 1) return "Penultimo mese di contratto";
  if (mesiAllaFine === 2) return "Terzultimo mese di contratto";
  return `Fine contratto tra ${mesiAllaFine} mesi`;
}

// Mesi di durata del contratto (inizio e fine inclusi), per stimare le ore
// previste al mese.
export function contractMonths(p: AssistenzaProject): number | null {
  if (!p.date_start || !p.date_end) return null;
  return Math.max(1, monthIndex(p.date_end) - monthIndex(p.date_start) + 1);
}

// Ore previste nel periodo scelto: ore previste al mese (sulla durata del
// contratto) per i mesi del periodo che cadono dentro il contratto. null se
// il progetto non ha date o ore previste.
export function orePrevistePeriodo(p: AssistenzaProject, year: number, month: number | null): number | null {
  const cm = contractMonths(p);
  if (!cm || !p.ore_previste) return null;
  const start = monthIndex(p.date_start!);
  const end = monthIndex(p.date_end!);
  let n = 0;
  for (let m = month ?? 1; m <= (month ?? 12); m++) {
    const idx = year * 12 + m - 1;
    if (idx >= start && idx <= end) n++;
  }
  return n ? (p.ore_previste / cm) * n : null;
}

// Avviso ore: arancione oltre l'80% delle ore previste del periodo, rosso
// oltre il 100%.
export const SOGLIA_AVVISO_ORE = 0.8;
export type AvvisoOre = "oltre" | "attenzione" | null;
export function avvisoOre(ore: number, previste: number | null): { avviso: AvvisoOre; pct: number | null } {
  if (!previste) return { avviso: null, pct: null };
  const pct = ore / previste;
  return { avviso: pct > 1 ? "oltre" : pct >= SOGLIA_AVVISO_ORE ? "attenzione" : null, pct };
}

export function emptyMonth(): AssistenzaMonth {
  return { fatturato: 0, fatturato_bozza: 0, ore: 0, ore_senza_ordine: 0 };
}

function addInto(acc: AssistenzaMonth, m: AssistenzaMonth | undefined) {
  if (!m) return;
  acc.fatturato += m.fatturato;
  acc.fatturato_bozza += m.fatturato_bozza;
  acc.ore += m.ore;
  acc.ore_senza_ordine += m.ore_senza_ordine;
}

// Somma dei mesi del periodo scelto: un mese ("2026-10") o un anno intero
// quando month è null.
export function periodTotals(p: AssistenzaProject, year: number, month: number | null): AssistenzaMonth {
  const acc = emptyMonth();
  for (const [ym, m] of Object.entries(p.months)) {
    if (Number(ym.slice(0, 4)) !== year) continue;
    if (month !== null && Number(ym.slice(5, 7)) !== month) continue;
    addInto(acc, m);
  }
  return acc;
}

// Cumulato dall'inizio dei dati fino alla fine del periodo scelto: serve a
// leggere il ricavo medio giornaliero anche quando il canone è fatturato a
// trimestre (mesi con fattura e mesi senza).
export function cumulativeTotals(p: AssistenzaProject, year: number, month: number | null): AssistenzaMonth {
  const end = `${year}-${String(month ?? 12).padStart(2, "0")}`;
  const acc = emptyMonth();
  for (const [ym, m] of Object.entries(p.months)) if (ym <= end) addInto(acc, m);
  return acc;
}

// Ricavo medio per giornata (8 ore): null se non ci sono ore registrate.
export function ricavoMedioGg(t: AssistenzaMonth): number | null {
  return t.ore > 0 ? t.fatturato / (t.ore / 8) : null;
}

export function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined || Math.abs(v) < 0.005) return "";
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(v) + " €";
}

export function fmtOre(v: number | null | undefined): string {
  if (v === null || v === undefined || Math.abs(v) < 0.005) return "";
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(v);
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
