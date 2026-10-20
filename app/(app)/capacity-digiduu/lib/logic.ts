import type { CapacityDoc } from "./types";

export interface PS {
  p: number;
  s: number;
}

export const NO_ROLE = "Senza ruolo";

const MONTHS_SHORT = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
const MONTHS_LONG = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export const fmt = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const tot = (c: PS) => c.p + c.s;
export const emptyRow = (n: number): PS[] => Array.from({ length: n }, () => ({ p: 0, s: 0 }));

export function monthShort(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS_SHORT[Number(m) - 1]} ${y.slice(2)}`;
}
export function monthLong(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS_LONG[Number(m) - 1]} ${y}`;
}
export function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// "DD10340 · AMG" -> "DD10340"; i nomi non DD non hanno budget per codice.
export function codeOfKey(key: string): string | null {
  return /^DD/.test(key) && key.includes(" · ") ? key.split(" · ")[0] : null;
}

export interface Indexed {
  // persona -> mese -> giornate su tutti i progetti
  byPerson: Map<string, PS[]>;
  // persona -> chiave progetto -> mese
  byPersonKey: Map<string, Map<string, PS[]>>;
  // chiave progetto -> persona -> mese
  byKeyPerson: Map<string, Map<string, PS[]>>;
}

export function indexItems(doc: CapacityDoc): Indexed {
  const n = doc.months.length;
  const mi = new Map(doc.months.map((m, i) => [m, i]));
  const byPerson = new Map<string, PS[]>();
  const byPersonKey = new Map<string, Map<string, PS[]>>();
  const byKeyPerson = new Map<string, Map<string, PS[]>>();
  const cell = <K>(map: Map<K, PS[]>, k: K) => {
    let row = map.get(k);
    if (!row) map.set(k, (row = emptyRow(n)));
    return row;
  };
  const sub = <K, V>(map: Map<K, Map<string, V>>, k: K) => {
    let m = map.get(k);
    if (!m) map.set(k, (m = new Map()));
    return m;
  };
  for (const [person, month, , state, days, key] of doc.items) {
    const i = mi.get(month);
    if (i === undefined) continue;
    for (const row of [cell(byPerson, person), cell(sub(byPersonKey, person), key), cell(sub(byKeyPerson, key), person)]) {
      row[i][state] += days;
    }
  }
  return { byPerson, byPersonKey, byKeyPerson };
}

export function sumRows(rows: PS[][], n: number): PS[] {
  const out = emptyRow(n);
  for (const r of rows) r.forEach((c, i) => ((out[i].p += c.p), (out[i].s += c.s)));
  return out;
}
