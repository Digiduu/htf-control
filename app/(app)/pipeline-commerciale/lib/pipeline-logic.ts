// Logica di calcolo pura, portata 1:1 da reference/pipeline-artifact-reference.html
// (stesso algoritmo dell'Artifact claude.ai originale — vedi HANDOFF.md sezione 3.3
// per la spiegazione della colonna Nota). Nessuna dipendenza da React: testabile
// direttamente contro i fixture in fixtures/.
import type { PipelineDoc, PipelineRow } from "./types";

export const STATE_COLOR: Record<string, string> = {
  "Bozza - Contrattualizzato": "#BDD7EE",
  "Confermata - Fatturato": "#C6E0B4",
  "Previsione - Offerta": "#FFC000",
  Consuntivi: "#FFFF00",
  Target: "#CCC0DA",
};

export const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return "";
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(v) + " €";
}

export function fmtSigned(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(Math.abs(v));
  return (v < 0 ? "-" : "") + s + " €";
}

export function normKey(s: string | null | undefined): string {
  return (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function orderKey(cliente: string, origine: string): string {
  return normKey(cliente) + "|" + normKey(origine);
}

export function aggregateOrders(doc: PipelineDoc): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  for (const r of doc.rows || []) {
    if (r.is_crm || !r.origine) continue;
    const k = orderKey(r.cliente, r.origine);
    if (!map[k]) map[k] = new Array(12).fill(0);
    for (let i = 0; i < 12; i++) map[k][i] += r.months[i] || 0;
  }
  return map;
}

// Fallback per generazioni storiche senza dettaglio ordine (vedi
// fixtures/digiduu/2026-07-03.json): aggrega per cliente invece che per ordine.
export function aggregateClients(doc: PipelineDoc): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  for (const r of doc.rows || []) {
    if (r.is_crm) continue;
    const k = normKey(r.cliente);
    if (!k) continue;
    if (!map[k]) map[k] = new Array(12).fill(0);
    for (let i = 0; i < 12; i++) map[k][i] += r.months[i] || 0;
  }
  return map;
}

export function hasOrderCodes(doc: PipelineDoc): boolean {
  return (doc.rows || []).some((r) => !r.is_crm && !!r.origine);
}

// Confronta i 12 mesi di una riga tra due generazioni e descrive il cambiamento
// in parole (spostamento, annullamento, aggiunta, variazione) invece di un
// semplice elenco di numeri — vedi HANDOFF.md 3.3.
export function diffMonths(monthsNew: (number | null)[], monthsOld: (number | null)[]): string | null {
  const fn = (x: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(Math.round(x));
  const round2 = (x: number | null | undefined) => Math.round((x || 0) * 100) / 100;
  const removed: { i: number; val: number }[] = [];
  const added: { i: number; val: number }[] = [];
  const changed: { i: number; vo: number; vn: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const vn = round2(monthsNew[i]);
    const vo = round2(monthsOld[i]);
    if (vn === vo) continue;
    if (!vo) added.push({ i, val: vn });
    else if (!vn) removed.push({ i, val: vo });
    else changed.push({ i, vo, vn });
  }
  const usedAdded = new Set<number>();
  const parts: { key: number; text: string }[] = [];
  for (const r of removed) {
    let bestIdx = -1;
    let bestDist = Infinity;
    added.forEach((a, ai) => {
      if (usedAdded.has(ai) || Math.abs(a.val - r.val) >= 0.01) return;
      const dist = Math.abs(a.i - r.i);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = ai;
      }
    });
    if (bestIdx >= 0) {
      usedAdded.add(bestIdx);
      const a = added[bestIdx];
      parts.push({ key: Math.min(r.i, a.i), text: `${MESI[r.i]}→${MESI[a.i]} spostato (${fn(r.val)}€)` });
    } else {
      parts.push({ key: r.i, text: `annullato ${MESI[r.i]} (${fn(r.val)}€)` });
    }
  }
  added.forEach((a, ai) => {
    if (usedAdded.has(ai)) return;
    parts.push({ key: a.i, text: `aggiunto ${MESI[a.i]} (${fn(a.val)}€)` });
  });
  for (const c of changed) {
    parts.push({ key: c.i, text: `variato ${MESI[c.i]} (${fn(c.vo)}€→${fn(c.vn)}€)` });
  }
  if (!parts.length) return null;
  parts.sort((a, b) => a.key - b.key);
  return parts.map((p) => p.text).join("; ");
}

// Match "sfumato" tra nomi cliente (solo per il fallback per-cliente): stessa
// chiave se una è sottostringa dell'altra, a parità si preferisce il rapporto
// lunghezza-corta/lunga più alto.
export function fuzzyClientKey(key: string, keys: string[]): string | null {
  if (!key || key.length < 3) return null;
  let best: string | null = null;
  let bestRatio = 0;
  for (const k of keys) {
    if (k === key || k.length < 3) continue;
    if (k.includes(key) || key.includes(k)) {
      const shorter = Math.min(key.length, k.length);
      const longer = Math.max(key.length, k.length);
      const ratio = shorter / longer;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = k;
      }
    }
  }
  return best;
}

export function buildNoteLookup(doc: PipelineDoc, prevDoc: PipelineDoc | null): (r: PipelineRow) => string | null {
  const cache: Record<string, string | null> = {};
  if (!prevDoc) return () => null;
  const curOrders = aggregateOrders(doc);
  const prevOrders = aggregateOrders(prevDoc);
  const prevDual = hasOrderCodes(prevDoc);
  const curClients = prevDual ? null : aggregateClients(doc);
  const prevClients = prevDual ? null : aggregateClients(prevDoc);
  const prevClientKeys = prevDual ? null : Object.keys(prevClients!);
  return (r: PipelineRow) => {
    if (r.is_crm) return null;
    if (prevDual) {
      if (!r.origine) return null;
      const k = orderKey(r.cliente, r.origine);
      if (!(k in cache)) {
        cache[k] = k in prevOrders ? diffMonths(curOrders[k], prevOrders[k]) : "Nuovo";
      }
      return cache[k];
    }
    const ck = normKey(r.cliente);
    if (!ck) return null;
    if (!(ck in cache)) {
      const matchKey = ck in prevClients! ? ck : fuzzyClientKey(ck, prevClientKeys!);
      cache[ck] = matchKey ? diffMonths(curClients![ck], prevClients![matchKey]) : "Nuovo";
    }
    return cache[ck];
  };
}

export interface CellState {
  stato: string | null;
  val: number;
}

export interface MergedRow extends PipelineRow {
  _cellStates: CellState[][];
}

// Un ordine può avere più stati (righe) nell'anno; se nessuno cade sullo stesso
// mese di un altro si accorpano in un'unica riga. Solo un vero conflitto
// (due stati nello stesso mese) produce una cella con colore diviso.
export function mergeOrderRows(rows: PipelineRow[]): MergedRow[] {
  const groups: MergedRow[] = [];
  const idx = new Map<string, MergedRow>();
  for (const r of rows) {
    if (r.is_crm || !r.origine) {
      groups.push({
        ...r,
        _cellStates: r.months.map((v) => (v ? [{ stato: r.stato, val: v }] : [])),
      });
      continue;
    }
    const k = orderKey(r.cliente, r.origine);
    let g = idx.get(k);
    if (!g) {
      g = {
        cliente: r.cliente,
        origine: r.origine,
        is_crm: false,
        crm_comment: null,
        account: r.account,
        project_leader: r.project_leader,
        referente: r.referente,
        stato: null,
        ordinato: 0,
        months: new Array(12).fill(0),
        totale: 0,
        nota: null,
        _cellStates: Array.from({ length: 12 }, () => []),
      };
      idx.set(k, g);
      groups.push(g);
    }
    g.ordinato = (g.ordinato || 0) + (r.ordinato || 0);
    g.totale = (g.totale || 0) + (r.totale || 0);
    for (let i = 0; i < 12; i++) {
      const v = r.months[i];
      if (v) {
        g.months[i] = (g.months[i] || 0) + v;
        g._cellStates[i].push({ stato: r.stato, val: v });
      }
    }
  }
  for (const g of groups) {
    if (!g.is_crm) {
      g.ordinato = g.ordinato || null;
      g.totale = g.totale || null;
      g.months = g.months.map((v) => v || null);
    }
  }
  return groups;
}
