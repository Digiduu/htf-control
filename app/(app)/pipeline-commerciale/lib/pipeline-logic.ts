// Logica di calcolo pura, portata 1:1 da reference/pipeline-artifact-reference.html
// (stesso algoritmo dell'Artifact claude.ai originale — vedi HANDOFF.md sezione 3.3
// per la spiegazione della colonna Nota). Nessuna dipendenza da React: testabile
// direttamente contro i fixture in fixtures/.
import type { PipelineDoc, PipelineRow } from "./types";

// Palette di riserva, usata solo quando una generazione non porta con sé i
// propri colori in stato_summary (vedi buildColorMap). "Previsione - Offerta"
// (valore storico, ancora presente nelle generazioni pre-05/10/2026) è stato
// sostituito da due stati distinti ("Previsione - Probabile" e "Previsione -
// Possibile", in base alla Fattibilità Odoo) — schema colori confermato
// nell'Artifact claude.ai di riferimento del 05/10/2026.
export const STATE_COLOR: Record<string, string> = {
  "Bozza - Contrattualizzato": "#BDD7EE",
  "Confermata - Fatturato": "#C6E0B4",
  "Previsione - Offerta": "#FFC000",
  "Previsione - Probabile": "#FFC000",
  "Previsione - Possibile": "#FFF2CC",
  Consuntivi: "#FFFF00",
  Target: "#CCC0DA",
};

// Nei dati (stato_summary[].color) l'hex arriva "nudo", senza #, es. "FFC000":
// il CSS lo accetta solo col prefisso, altrimenti il colore è semplicemente
// ignorato come non valido (nessuno sfondo, non un errore visibile).
export function normalizeHexColor(color: string): string {
  return color.startsWith("#") ? color : `#${color}`;
}

// Mappa stato -> colore per la generazione corrente. I colori sono ormai
// registrati nei dati stessi (doc.stato_summary[].color), non in una mappa
// statica: questo permette a generazioni storiche con uno schema di stati
// diverso (es. il vecchio "Previsione - Offerta" unico, o Consuntivi giallo)
// di continuare a mostrare i propri colori originali invece di essere
// ricolorate con la palette corrente. STATE_COLOR resta solo come riserva per
// uno stato che, per qualche motivo, non comparisse nel riepilogo.
export function buildColorMap(doc: PipelineDoc | null | undefined): Record<string, string> {
  const map: Record<string, string> = { ...STATE_COLOR };
  for (const s of doc?.stato_summary || []) {
    map[s.stato] = normalizeHexColor(s.color);
  }
  return map;
}

// Totale annuo di un singolo stato in una generazione, per le viste di
// sintesi (es. Sintesi Pipeline). Restituisce null — non 0 — quando lo stato
// non compare affatto in questa generazione (es. "Previsione - Possibile" in
// una generazione con lo schema di stati precedente allo split
// Probabile/Possibile), per poterlo distinguere da un valore effettivamente
// pari a zero.
export function statoTotale(doc: PipelineDoc | null | undefined, stato: string): number | null {
  const entry = doc?.stato_summary?.find((s) => s.stato === stato);
  return entry ? entry.totale : null;
}

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


export interface PrevCurrentEntry {
  cliente: string;
  origine: string | null;
  // Project Leader dell'ordine nella generazione di confronto: serve solo a
  // filtrare questa tabellina quando il selettore Project Leader della
  // pagina è attivo (vedi page.tsx) — Oriens e le generazioni senza
  // dettaglio ordine non lo valorizzano.
  projectLeader: string | null;
  prevVal: number | null;
  curVal: number | null;
  // "Confermata" = la generazione ATTUALE riporta per lo stesso ordine/
  // cliente e lo stesso mese esattamente lo stesso valore della generazione
  // di confronto: il dato non è cambiato. "Non confermata" = il valore
  // attuale è diverso (sparito, ridotto, aumentato...) da quanto diceva la
  // generazione di confronto — da colorare come avviso, non basta che il
  // valore attuale sia "presente" (un valore diverso da zero ma diverso dal
  // precedente non conta come confermato).
  prevConfirmed: boolean;
  curConfirmed: boolean;
}

// Tabellina "Mese precedente / Mese attuale": cosa diceva la generazione di
// confronto sui due mesi CALENDARIO REALI di oggi (non il mese in cui quella
// generazione è stata creata) — es. se oggi è ottobre, confrontando con una
// generazione di settembre si vogliono comunque i valori di settembre e
// ottobre così come li riportava quella generazione, non agosto/settembre.
// Se oggi è gennaio il "mese precedente" ricadrebbe nell'anno prima, fuori
// dall'array months[12] di una singola annualità: in quel caso non c'è
// nulla da mostrare (null). Stessa idea del mese usato per aprire la
// tabella principale (vedi l'effect di scroll in page.tsx).
export function buildPrevCurrentTable(doc: PipelineDoc, compareDoc: PipelineDoc): PrevCurrentEntry[] | null {
  if (compareDoc.year !== new Date().getFullYear()) return null;
  const curIdx = new Date().getMonth(); // 0 = Gennaio
  if (curIdx < 1) return null;
  const prevIdx = curIdx - 1;
  const entries: PrevCurrentEntry[] = [];
  if (hasOrderCodes(compareDoc)) {
    const labels = new Map<string, { cliente: string; origine: string; projectLeader: string | null }>();
    for (const r of compareDoc.rows || []) {
      if (r.is_crm || !r.origine) continue;
      labels.set(orderKey(r.cliente, r.origine), { cliente: r.cliente, origine: r.origine, projectLeader: r.project_leader });
    }
    const orders = aggregateOrders(compareDoc);
    const currentOrders = aggregateOrders(doc);
    for (const [k, months] of Object.entries(orders)) {
      const prevVal = months[prevIdx] || null;
      const curVal = months[curIdx] || null;
      if (!prevVal && !curVal) continue;
      const label = labels.get(k);
      const currentMonths = currentOrders[k];
      entries.push({
        cliente: label?.cliente || k,
        origine: label?.origine || null,
        projectLeader: label?.projectLeader ?? null,
        prevVal,
        curVal,
        prevConfirmed: (currentMonths?.[prevIdx] || null) === prevVal,
        curConfirmed: (currentMonths?.[curIdx] || null) === curVal,
      });
    }
  } else {
    const clients = aggregateClients(compareDoc);
    const currentClients = aggregateClients(doc);
    const labels = new Map<string, { cliente: string; projectLeader: string | null }>();
    for (const r of compareDoc.rows || []) {
      if (r.is_crm) continue;
      const k = normKey(r.cliente);
      if (k && !labels.has(k)) labels.set(k, { cliente: r.cliente, projectLeader: r.project_leader });
    }
    for (const [k, months] of Object.entries(clients)) {
      const prevVal = months[prevIdx] || null;
      const curVal = months[curIdx] || null;
      if (!prevVal && !curVal) continue;
      const currentMonths = currentClients[k];
      const label = labels.get(k);
      entries.push({
        cliente: label?.cliente || k,
        origine: null,
        projectLeader: label?.projectLeader ?? null,
        prevVal,
        curVal,
        prevConfirmed: (currentMonths?.[prevIdx] || null) === prevVal,
        curConfirmed: (currentMonths?.[curIdx] || null) === curVal,
      });
    }
  }
  entries.sort((a, b) => a.cliente.localeCompare(b.cliente, "it"));
  return entries;
}

export interface CellState {
  stato: string | null;
  val: number;
}

// Filtro "Tipologia" della toolbar: esclude gli stati disattivati da un
// elenco di CellState di una cella, così la cifra mostrata e il colore
// riflettono solo le tipologie che l'utente ha lasciato spuntate.
export function visibleCellStates(states: CellState[], disabled: Set<string>): CellState[] {
  return disabled.size ? states.filter((s) => !disabled.has(s.stato || "")) : states;
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
        origine_titolo: r.origine_titolo || null,
        ordinato: 0,
        months: new Array(12).fill(0),
        totale: 0,
        nota: null,
        _cellStates: Array.from({ length: 12 }, () => []),
      };
      idx.set(k, g);
      groups.push(g);
    }
    // Il titolo è proprietà dell'ordine, non del singolo stato: può arrivare
    // su una qualsiasi delle righe con lo stesso codice origine.
    if (!g.origine_titolo && r.origine_titolo) g.origine_titolo = r.origine_titolo;
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
