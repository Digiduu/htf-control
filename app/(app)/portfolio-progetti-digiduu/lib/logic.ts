// Logica pura (nessuna dipendenza da React/Supabase): riusa 1:1 le funzioni
// già scritte per Report Progetti Digiduu (stesso identico modello dati, vedi
// lib/types.ts) e aggiunge solo ciò che manca per questo modulo — soglia
// ricavo medio basso, calendario mensile completo e raggruppamento per
// cliente (prompt di handoff §5.1, §5.3).
export {
  fmtEUR,
  fmtEUR2,
  fmtDays,
  fmtDate,
  fmtMonth,
  slugify,
  daysBarInfo,
  getAlerts,
  FILTERS,
  riepSummary,
  PAYMENT_STATE_LABELS,
} from "../../report-progetti/lib/report-progetti-logic";
export type { FilterKey, FilterDef } from "../../report-progetti/lib/report-progetti-logic";

import type { Group, Invoice, Milestone, PlanningByResource } from "./types";
import type { MonthColumn, MonthlyCalendar } from "./types";
import type { ActivePhaseProject, ActivePhasePlRow, ActivePhaseSummary } from "./types";

// Link diretto al progetto su Odoo: `Group.id` è l'id Odoo del progetto
// "padre"/canonico del gruppo (vedi data.ts e la migration), non un id
// generato — quindi basta comporre l'URL, nessuna mappatura aggiuntiva.
// Un solo Odoo condiviso tra le aziende (Digiduu, Oriens, ecc.), da qui il
// dominio "oriens-consulting.odoo.com" anche per i progetti Digiduu.
export function odooProjectUrl(groupId: number): string {
  return `https://oriens-consulting.odoo.com/odoo/project/${groupId}`;
}

// Soglia di attenzione sul ricavo medio giornaliero (§5.1 del prompt di
// handoff): sotto 700€/gg il valore va mostrato in rosso con un pallino.
export const LOW_REVENUE_THRESHOLD = 700;

export function isLowRevenueRate(avgPerDay: number | null): boolean {
  return avgPerDay != null && Number.isFinite(avgPerDay) && avgPerDay < LOW_REVENUE_THRESHOLD;
}

export function baselineAvg(g: Group): number | null {
  return g.prop_days ? g.prop_price / g.prop_days : null;
}

export function actualAvg(g: Group): number | null {
  return g.act_days ? g.act_rev / g.act_days : null;
}

export function forecastDaysAndAvg(g: Group): { days: number; avg: number | null } {
  const days = (g.act_days || 0) + (g.plan_days || 0);
  return { days, avg: days ? g.fc_rev / days : null };
}

// Controlli automatici sui dati (§5.5, chip "ⓘ"): segnalano incoerenze senza
// bloccare nulla, un livello più leggero degli alert "⚠" di getAlerts().
export interface DataCheck {
  key: string;
  label: string;
}

export function getDataChecks(g: Group, todayISO: string): DataCheck[] {
  const checks: DataCheck[] = [];
  const today = todayISO;

  if (g.active && g.stage === "In corso" && g.date_end && g.date_end < today) {
    checks.push({ key: "fine-passata", label: "Fine progetto già passata" });
  }
  if (g.act_days > 0.5 && g.act_rev === 0 && g.draft_rev === 0) {
    checks.push({ key: "ore-senza-fatturato", label: "Ore registrate ma nessun fatturato" });
  }
  if (g.act_rev > 0 && g.act_days === 0) {
    checks.push({ key: "fatturato-senza-ore", label: "Fatturato presente ma nessuna ora registrata" });
  }

  const unreached = (g.milestones || []).filter((m) => !m.is_reached);
  const beyondEnd = g.date_end ? unreached.filter((m) => m.deadline && m.deadline > g.date_end!) : [];
  if (beyondEnd.length) {
    checks.push({ key: "milestone-oltre-fine", label: `${beyondEnd.length} milestone oltre la fine progetto` });
  }
  if (g.active) {
    const overdue = unreached.filter((m) => m.deadline && m.deadline < today);
    if (overdue.length) {
      checks.push({ key: "milestone-scadute", label: `${overdue.length} milestone scadute` });
    }
  }
  const noDate = (g.milestones || []).filter((m) => !m.deadline);
  if (noDate.length) {
    checks.push({ key: "milestone-senza-data", label: `${noDate.length} milestone senza data` });
  }

  return checks;
}

function monthKey(d: string): string {
  return d.slice(0, 7);
}

function addMonths(monthKeyStr: string, delta: number): string {
  const [y, m] = monthKeyStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function fmtMonthYearShort(m: string): string {
  const [y, mm] = m.split("-");
  return `${mm}/${y}`;
}

// Input generico del calendario mensile: un singolo progetto (gruppo) o
// l'unione di più progetti dello stesso cliente (riga di totale, §5.3 "Righe").
export interface MonthlyCalendarInput {
  dateStart: string | null;
  dateEnd: string | null;
  invoices: Invoice[];
  milestones: Milestone[];
  planningByResource: PlanningByResource[];
  monthlyDays: Record<string, number>;
}

// Primo mese della finestra "normale" (12 mesi indietro dal mese corrente),
// usato per capire se un mese ricade nella parte "estesa" (intestazione
// arancio, §5.3) indipendentemente dal progetto che si sta disegnando.
export function normalWindowStartMonth(todayISO: string): string {
  return addMonths(monthKey(todayISO), -12);
}

export function isBeforeNormalWindow(month: string, todayISO: string): boolean {
  return month < normalWindowStartMonth(todayISO);
}

// Mese di partenza condiviso da tutta la tabella (§5.3 "Eccezione"): parte
// dai 12 mesi indietro standard, ma si estende fino all'inizio del progetto
// più vecchio tra quelli mostrati, così tutte le righe hanno le stesse
// colonne anche quando i singoli progetti sono iniziati in momenti diversi.
export function computeSharedStartMonth(groups: Group[], todayISO: string): { startMonth: string; extended: boolean } {
  let startMonth = normalWindowStartMonth(todayISO);
  let extended = false;
  for (const g of groups) {
    if (g.date_start) {
      const sm = monthKey(g.date_start);
      if (sm < startMonth) {
        startMonth = sm;
        extended = true;
      }
    }
  }
  return { startMonth, extended };
}

// Opzioni di `buildMonthlyCalendar`: o la finestra scorrevole di sempre
// (ultimi 12 mesi + colonna futura), o un anno solare fisso (Gennaio-Dicembre
// di `yearFilter`) quando l'utente sceglie un anno dal selettore — vedi
// `PortfolioClient`/`MonthlyCalendarTable`.
export interface MonthlyCalendarOptions {
  forcedStartMonth?: string;
  yearFilter?: number;
}

// Un'unica colonna mese: fatturato/giornate/ricavo medio/milestone, più
// l'aggiornamento (in place) dei contatori cumulativi del chiamante — estratta
// per essere riusata sia dalla finestra scorrevole sia dalla vista per anno
// solare, che condividono lo stesso identico calcolo per mese.
function buildOneMonthColumn(
  m: string,
  input: MonthlyCalendarInput,
  todayISO: string,
  dateEndMonth: string | null,
  planningByMonth: Map<string, number>,
  milestonesByMonth: Map<string, Milestone[]>,
  cum: { emesso: number; giornate: number }
): MonthColumn {
  const currentMonth = monthKey(todayISO);
  const invoicesInMonth = (input.invoices || []).filter((inv) => monthKey(inv.date) === m);
  const emesso = invoicesInMonth.filter((inv) => inv.state === "posted").reduce((a, inv) => a + (inv.is_credit_note ? -inv.amount : inv.amount), 0);
  const bozza = invoicesInMonth.filter((inv) => inv.state === "draft").reduce((a, inv) => a + inv.amount, 0);
  const giornateRegistrate = Object.prototype.hasOwnProperty.call(input.monthlyDays, m) ? input.monthlyDays[m] : null;
  const giornatePianificate = planningByMonth.has(m) ? planningByMonth.get(m)! : null;

  const ricavoMedioMese = giornateRegistrate && giornateRegistrate > 0 ? (emesso + bozza) / giornateRegistrate : null;

  // Cumulato: solo sul confermato (emesso), non sulle bozze — vedi §5.3 punto 5.
  cum.emesso += emesso;
  cum.giornate += giornateRegistrate || 0;
  const ricavoMedioCumulato = cum.giornate > 0 ? cum.emesso / cum.giornate : null;

  const msInMonth = milestonesByMonth.get(m) || [];

  return {
    month: m,
    isCurrent: m === currentMonth,
    isFuture: m > currentMonth,
    isFutureBucket: false,
    fatturatoEmesso: emesso,
    fatturatoBozza: bozza,
    invoiceTooltip: invoicesInMonth.map((inv) => `${inv.number ?? "bozza"}: ${inv.amount}€`),
    giornateRegistrate,
    giornatePianificate,
    ricavoMedioMese,
    ricavoMedioCumulato,
    fineProgetto: !!dateEndMonth && dateEndMonth === m,
    fineProgettoLabel: null,
    milestones: msInMonth.map((ms) => ({
      name: ms.name,
      isReached: ms.is_reached,
      isOverdue: !ms.is_reached && !!ms.deadline && ms.deadline < todayISO,
      isBeyondEnd: !!dateEndMonth && !!ms.deadline && monthKey(ms.deadline) > dateEndMonth,
      deadline: ms.deadline,
    })),
  };
}

// Calendario mensile (§5.3, "cuore del report"): dal mese corrente indietro di
// 12 mesi, esteso fino all'inizio del progetto se più vecchio, più una
// colonna futura aggregata ("da <mese successivo>"). Il cumulato (punto 5
// della spec) va calcolato in ordine cronologico dall'inizio del calendario,
// quindi qui si itera avanti nel tempo e solo alla fine si inverte l'ordine
// per la visualizzazione richiesta (mese corrente → passato).
// `forcedStartMonth` permette a più righe (progetti di uno stesso cliente, o
// l'intera tabella) di condividere esattamente le stesse colonne — vedi
// `computeSharedStartMonth`. `yearFilter` sostituisce del tutto la finestra
// scorrevole con un anno solare fisso (Gennaio→Dicembre, ordine cronologico
// normale, nessuna colonna futura aggregata): il cumulato continua comunque a
// partire dall'inizio vero del progetto, solo le colonne dell'anno scelto
// vengono mostrate.
export function buildMonthlyCalendar(input: MonthlyCalendarInput, todayISO: string, options?: string | MonthlyCalendarOptions): MonthlyCalendar {
  // Compatibilità con le chiamate esistenti che passano `forcedStartMonth`
  // come stringa al posto di un oggetto opzioni.
  const opts: MonthlyCalendarOptions = typeof options === "string" ? { forcedStartMonth: options } : (options ?? {});
  const { forcedStartMonth, yearFilter } = opts;

  const currentMonth = monthKey(todayISO);
  const projectStartMonth = input.dateStart ? monthKey(input.dateStart) : null;

  const planningByMonth = new Map<string, number>();
  for (const r of input.planningByResource || []) {
    for (const [m, days] of Object.entries(r.days || {})) {
      planningByMonth.set(m, (planningByMonth.get(m) || 0) + days);
    }
  }

  const milestonesByMonth = new Map<string, Milestone[]>();
  for (const ms of input.milestones || []) {
    if (!ms.deadline) continue;
    const key = monthKey(ms.deadline);
    const list = milestonesByMonth.get(key) || [];
    list.push(ms);
    milestonesByMonth.set(key, list);
  }

  const dateEndMonth = input.dateEnd ? monthKey(input.dateEnd) : null;

  if (yearFilter) {
    const yearStart = `${yearFilter}-01`;
    const yearEnd = `${yearFilter}-12`;
    // Il cumulato deve comunque partire dall'inizio vero del progetto (o da
    // gennaio dell'anno scelto se il progetto è iniziato dopo): le colonne
    // precedenti all'anno scelto vengono calcolate ma non mostrate.
    const chronoStart = projectStartMonth && projectStartMonth < yearStart ? projectStartMonth : yearStart;

    const cum = { emesso: 0, giornate: 0 };
    const columns: MonthColumn[] = [];
    for (let m = chronoStart; m <= yearEnd; m = addMonths(m, 1)) {
      const col = buildOneMonthColumn(m, input, todayISO, dateEndMonth, planningByMonth, milestonesByMonth, cum);
      if (m >= yearStart && m <= yearEnd) columns.push(col);
    }

    return { columns, startMonth: yearStart, extendedForOlderProject: false };
  }

  let startMonth: string;
  let extended: boolean;
  if (forcedStartMonth) {
    startMonth = forcedStartMonth;
    extended = forcedStartMonth < normalWindowStartMonth(todayISO);
  } else {
    startMonth = normalWindowStartMonth(todayISO);
    extended = false;
    if (projectStartMonth && projectStartMonth < startMonth) {
      startMonth = projectStartMonth;
      extended = true;
    }
  }

  const chronological: string[] = [];
  for (let m = startMonth; m <= currentMonth; m = addMonths(m, 1)) chronological.push(m);
  const futureBucketMonth = addMonths(currentMonth, 1);

  const cum = { emesso: 0, giornate: 0 };
  const builtChrono: MonthColumn[] = chronological.map((m) => buildOneMonthColumn(m, input, todayISO, dateEndMonth, planningByMonth, milestonesByMonth, cum));

  // Colonna futura aggregata: tutto ciò che viene dopo il mese corrente, non
  // solo il mese immediatamente successivo (§5.3: "somma delle bozze di
  // fattura future, delle giornate pianificate future, delle milestone
  // future e della data di fine progetto se cade dopo il mese corrente").
  const futureInvoices = (input.invoices || []).filter((inv) => monthKey(inv.date) > currentMonth);
  const futureEmesso = futureInvoices.filter((inv) => inv.state === "posted").reduce((a, inv) => a + (inv.is_credit_note ? -inv.amount : inv.amount), 0);
  const futureBozza = futureInvoices.filter((inv) => inv.state === "draft").reduce((a, inv) => a + inv.amount, 0);

  let futurePlanned: number | null = null;
  for (const [key, days] of planningByMonth) {
    if (key > currentMonth) futurePlanned = (futurePlanned || 0) + days;
  }

  const futureMilestones: Milestone[] = [];
  for (const [key, list] of milestonesByMonth) {
    if (key > currentMonth) futureMilestones.push(...list);
  }

  const futureEndsLater = !!dateEndMonth && dateEndMonth > currentMonth;

  const futureColumn: MonthColumn = {
    month: futureBucketMonth,
    isCurrent: false,
    isFuture: true,
    isFutureBucket: true,
    fatturatoEmesso: futureEmesso,
    fatturatoBozza: futureBozza,
    invoiceTooltip: futureInvoices.map((inv) => `${inv.number ?? "bozza"}: ${inv.amount}€`),
    giornateRegistrate: null,
    giornatePianificate: futurePlanned,
    ricavoMedioMese: null,
    ricavoMedioCumulato: null,
    fineProgetto: futureEndsLater,
    fineProgettoLabel: futureEndsLater ? fmtMonthYearShort(dateEndMonth!) : null,
    milestones: futureMilestones.map((ms) => ({
      name: ms.name,
      isReached: ms.is_reached,
      isOverdue: false,
      isBeyondEnd: !!dateEndMonth && !!ms.deadline && monthKey(ms.deadline) > dateEndMonth,
      deadline: ms.deadline,
    })),
  };

  // Ordine di visualizzazione richiesto: colonna futura, mese corrente, poi
  // indietro nel tempo (il calcolo sopra era invece in ordine cronologico,
  // necessario per il cumulato).
  const columns = [futureColumn, ...[...builtChrono].reverse()];

  return { columns, startMonth, extendedForOlderProject: extended };
}

export function buildMonthlyCalendarForGroup(
  g: Group,
  monthlyDays: Record<string, number>,
  todayISO: string,
  options?: string | MonthlyCalendarOptions
): MonthlyCalendar {
  return buildMonthlyCalendar(
    {
      dateStart: g.date_start,
      dateEnd: g.date_end,
      invoices: g.invoices || [],
      milestones: g.milestones || [],
      planningByResource: g.planning_future?.by_resource ?? [],
      monthlyDays,
    },
    todayISO,
    options
  );
}

// Riga di totale per cliente (§5.3 "Righe"): stessa logica del singolo
// progetto, ma sui dati sommati di tutti i suoi gruppi mostrati dal filtro.
export function buildMonthlyCalendarForClient(
  groups: Group[],
  monthlyDaysByGroupId: Record<number, Record<string, number>>,
  todayISO: string,
  options?: string | MonthlyCalendarOptions
): MonthlyCalendar {
  const dateStart = groups.reduce<string | null>((min, g) => (g.date_start && (!min || g.date_start < min) ? g.date_start : min), null);
  const dateEndCandidates = groups.map((g) => g.date_end).filter((d): d is string => !!d);
  const dateEnd = dateEndCandidates.length ? dateEndCandidates.reduce((max, d) => (d > max ? d : max)) : null;

  const monthlyDays: Record<string, number> = {};
  for (const g of groups) {
    for (const [m, d] of Object.entries(monthlyDaysByGroupId[g.id] || {})) {
      monthlyDays[m] = (monthlyDays[m] || 0) + d;
    }
  }

  return buildMonthlyCalendar(
    {
      dateStart,
      dateEnd,
      invoices: groups.flatMap((g) => g.invoices || []),
      milestones: groups.flatMap((g) => g.milestones || []),
      planningByResource: groups.flatMap((g) => g.planning_future?.by_resource ?? []),
      monthlyDays,
    },
    todayISO,
    options
  );
}

// Il cliente è la prima parte di `partner` prima della virgola, perché
// alcuni partner sono contatti come "Serramenti Brombal S.r.l, Andrea
// Cairati" (§5.3 "Righe").
export function clientNameOf(partner: string): string {
  return (partner || "").split(",")[0].trim();
}

export interface ClientGroup {
  clientName: string;
  groups: Group[];
}

// Raggruppa per cliente e ordina secondo §5.3: clienti per Ricavi Forecast
// decrescenti; dentro il cliente, prima gli attivi, poi gli "In corso", poi
// per Forecast decrescente.
export function groupAndSortByClient(groups: Group[]): ClientGroup[] {
  const byClient = new Map<string, Group[]>();
  for (const g of groups) {
    const name = clientNameOf(g.partner);
    const list = byClient.get(name) || [];
    list.push(g);
    byClient.set(name, list);
  }

  const clientGroups: ClientGroup[] = [...byClient.entries()].map(([clientName, gs]) => ({
    clientName,
    groups: [...gs].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const aInCorso = a.stage === "In corso";
      const bInCorso = b.stage === "In corso";
      if (aInCorso !== bInCorso) return aInCorso ? -1 : 1;
      return (b.fc_rev || 0) - (a.fc_rev || 0);
    }),
  }));

  clientGroups.sort((a, b) => {
    const fa = a.groups.reduce((s, g) => s + (g.fc_rev || 0), 0);
    const fb = b.groups.reduce((s, g) => s + (g.fc_rev || 0), 0);
    return fb - fa;
  });

  return clientGroups;
}

// Barra giornate spese/ordinate aggregata su più gruppi (stessa soglia di
// `daysBarInfo`, §5.2), per la riga di totale cliente.
export function aggregateDaysBarInfo(groups: Group[]): { ratio: number | null; className: "good" | "warning" | "critical" | "neutral"; widthPct: number } {
  const propDays = groups.reduce((a, g) => a + (g.prop_days || 0), 0);
  const actDays = groups.reduce((a, g) => a + (g.act_days || 0), 0);
  const ratio = propDays ? actDays / propDays : null;
  let className: "good" | "warning" | "critical" | "neutral" = "neutral";
  if (ratio != null) {
    if (ratio <= 1) className = "good";
    else if (ratio <= 1.2) className = "warning";
    else className = "critical";
  }
  const widthPct = ratio != null ? Math.min(ratio * 100, 100) : 0;
  return { ratio, className, widthPct };
}

// Stessa barra di `aggregateDaysBarInfo`, ma su metriche già ripartite per
// anno (vedi `computeYearScopedMetrics`) invece che sui valori lifetime dei
// gruppi — per la riga di totale cliente quando è attivo il filtro anno.
export function aggregateDaysBarFromScoped(
  metrics: YearScopedMetrics[]
): { ratio: number | null; className: "good" | "warning" | "critical" | "neutral"; widthPct: number } {
  const propDays = metrics.reduce((a, s) => a + s.propDays, 0);
  const actDays = metrics.reduce((a, s) => a + s.actDays, 0);
  const ratio = propDays ? actDays / propDays : null;
  let className: "good" | "warning" | "critical" | "neutral" = "neutral";
  if (ratio != null) {
    if (ratio <= 1) className = "good";
    else if (ratio <= 1.2) className = "warning";
    else className = "critical";
  }
  const widthPct = ratio != null ? Math.min(ratio * 100, 100) : 0;
  return { ratio, className, widthPct };
}

// "Progetti attivi per fase" (§6.3): ricompone la tabella per PL, i KPI e i
// quattro elenchi apribili a partire dall'elenco piatto dei singoli progetti
// Odoo (ppd_active_projects_by_phase) — qui, a differenza del resto del
// modulo, non si ragiona per gruppo/progetto padre.
export function computeActivePhaseSummary(projects: ActivePhaseProject[]): ActivePhaseSummary {
  const daFareList = projects.filter((p) => p.stage === "Da fare");
  const inCorsoList = projects.filter((p) => p.stage === "In corso");
  const assistenzaProjects = projects.filter((p) => p.isAssistenza);
  const contrattiAssistenzaList = assistenzaProjects.filter((p) => p.projectName.toLowerCase().includes("assistenza"));
  const affiancamentiList = assistenzaProjects.filter((p) => !p.projectName.toLowerCase().includes("assistenza"));

  const byPlMap = new Map<string, ActivePhasePlRow>();
  for (const p of projects) {
    const row =
      byPlMap.get(p.plName) ??
      ({ plName: p.plName, daFare: 0, daFareAssistenza: 0, inCorso: 0, inCorsoAssistenza: 0, totale: 0, totaleAssistenza: 0 } satisfies ActivePhasePlRow);
    if (p.stage === "Da fare") {
      row.daFare += 1;
      if (p.isAssistenza) row.daFareAssistenza += 1;
    } else {
      row.inCorso += 1;
      if (p.isAssistenza) row.inCorsoAssistenza += 1;
    }
    row.totale += 1;
    if (p.isAssistenza) row.totaleAssistenza += 1;
    byPlMap.set(p.plName, row);
  }
  const byPl = [...byPlMap.values()].sort((a, b) => b.totale - a.totale);

  const attivi = projects.length;
  const assistenza = assistenzaProjects.length;

  return {
    totals: {
      attivi,
      daFare: daFareList.length,
      daFareAssistenza: daFareList.filter((p) => p.isAssistenza).length,
      inCorso: inCorsoList.length,
      inCorsoAssistenza: inCorsoList.filter((p) => p.isAssistenza).length,
      assistenza,
      assistenzaPct: attivi ? Math.round((assistenza / attivi) * 100) : 0,
    },
    byPl,
    daFareList,
    inCorsoList,
    contrattiAssistenzaList,
    affiancamentiList,
  };
}

export interface YearScopedMetrics {
  propDays: number;
  propPrice: number;
  actDays: number;
  actRev: number;
  draftRev: number;
  planDays: number;
  fcRev: number;
}

// Versione "per anno" delle metriche di un gruppo, per il filtro anno della
// vista progetti. Giornate spese (actDays) e Actual (actRev/draftRev) si
// calcolano in modo esatto, perché derivano da dati con una data precisa
// (foglio ore mensile, fatture). Giornate ordinate, Baseline e Forecast
// invece vengono dall'ordine di vendita/da una stima Odoo "per tutta la vita
// del progetto": non hanno una data mese per mese, quindi qui si ripartiscono
// in proporzione a quanto lavoro (giornate spese) è stato fatto in
// quell'anno rispetto al totale — un'approssimazione dichiarata, non un dato
// esatto come gli altri, ma l'unica ripartizione sensata con i dati
// disponibili (l'alternativa "tutto nell'anno di inizio progetto" sarebbe
// sbagliata per i progetti pluriennali come Brombal).
export function computeYearScopedMetrics(g: Group, monthlyDays: Record<string, number>, year: number): YearScopedMetrics {
  const yearStart = `${year}-01`;
  const yearEnd = `${year}-12`;
  const inYear = (m: string) => m >= yearStart && m <= yearEnd;

  const totalActDays = Object.values(monthlyDays).reduce((a, d) => a + d, 0);
  const actDays = Object.entries(monthlyDays).reduce((sum, [m, d]) => (inYear(m) ? sum + d : sum), 0);

  const invoicesInYear = (g.invoices || []).filter((inv) => inYear(inv.date.slice(0, 7)));
  const actRev = invoicesInYear.filter((inv) => inv.state === "posted").reduce((a, inv) => a + (inv.is_credit_note ? -inv.amount : inv.amount), 0);
  const draftRev = invoicesInYear.filter((inv) => inv.state === "draft").reduce((a, inv) => a + inv.amount, 0);

  let planDays = 0;
  for (const r of g.planning_future?.by_resource || []) {
    for (const [m, d] of Object.entries(r.days || {})) {
      if (inYear(m)) planDays += d;
    }
  }

  // Quota di sforzo di quest'anno sul totale del progetto: se non c'è ancora
  // nessuna giornata registrata (progetto appena partito), attribuisce tutto
  // all'anno di inizio progetto invece di azzerare baseline/forecast ovunque.
  const startYear = g.date_start ? g.date_start.slice(0, 4) : null;
  const ratio = totalActDays > 0 ? actDays / totalActDays : startYear === String(year) ? 1 : 0;

  return {
    propDays: g.prop_days * ratio,
    propPrice: g.prop_price * ratio,
    actDays,
    actRev,
    draftRev,
    planDays,
    fcRev: g.fc_rev * ratio,
  };
}
