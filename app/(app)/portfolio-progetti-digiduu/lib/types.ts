// Portfolio Progetti Digiduu — stesso modello dati di Report Progetti Digiduu
// (vedi app/(app)/report-progetti/lib/types.ts), qui riusato 1:1: i dati
// restano gli stessi (gruppo = "progetto padre"), cambia solo dove sono
// salvati (tabelle granulari con RLS reali invece di un unico jsonb). Vedi
// app/(app)/portfolio-progetti-digiduu/lib/data.ts per come vengono
// ricomposti in questa stessa forma dopo la query.
export type {
  Invoice,
  PlanningByResource,
  PlanningFuture,
  Milestone,
  TaskStageEntry,
  SaleOrder,
  Doc,
  Group,
  Alert,
  ProjectLeaderReport,
} from "../../report-progetti/lib/types";

// Colonna mese del calendario (prompt di handoff §5.3). "giornateRegistrate"
// null per un mese = nessun dato di foglio ore per quel mese (es. prima
// dell'inizio del progetto), non "zero lavorato": la UI deve distinguerli.
// "isFutureBucket" è vero solo per l'ultima colonna ("da <mese successivo>"),
// che non rappresenta un singolo mese ma la somma di tutto ciò che viene dopo.
export interface MonthColumn {
  month: string; // "YYYY-MM" — per la colonna futura è il primo mese futuro, usato solo per l'etichetta "da <mese>"
  isCurrent: boolean;
  isFuture: boolean;
  isFutureBucket: boolean;
  fatturatoEmesso: number;
  fatturatoBozza: number;
  invoiceTooltip: string[];
  giornateRegistrate: number | null;
  giornatePianificate: number | null;
  ricavoMedioMese: number | null; // (emesso + bozze) ÷ giornate registrate del mese
  ricavoMedioCumulato: number | null; // emesso cumulato ÷ giornate cumulate, in ordine cronologico dall'inizio calendario
  fineProgetto: boolean;
  fineProgettoLabel: string | null; // "MM/AAAA" quando la fine cade nella colonna futura aggregata
  milestones: { name: string; isReached: boolean; isOverdue: boolean; isBeyondEnd: boolean; deadline: string | null }[];
}

export interface MonthlyCalendar {
  columns: MonthColumn[];
  startMonth: string;
  extendedForOlderProject: boolean;
}

// "Progetti attivi per fase" (prompt di handoff §6.3): conta i singoli
// progetti Odoo, non i gruppi/progetti padre — vedi ppd_active_projects_by_phase.
export interface ActivePhaseProject {
  id: number;
  plName: string;
  projectName: string;
  stage: "Da fare" | "In corso";
  isAssistenza: boolean;
}

export interface ActivePhasePlRow {
  plName: string;
  daFare: number;
  daFareAssistenza: number;
  inCorso: number;
  inCorsoAssistenza: number;
  totale: number;
  totaleAssistenza: number;
}

export interface ActivePhaseSummary {
  totals: {
    attivi: number;
    daFare: number;
    daFareAssistenza: number;
    inCorso: number;
    inCorsoAssistenza: number;
    assistenza: number;
    assistenzaPct: number;
  };
  byPl: ActivePhasePlRow[];
  daFareList: ActivePhaseProject[];
  inCorsoList: ActivePhaseProject[];
  contrattiAssistenzaList: ActivePhaseProject[];
  affiancamentiList: ActivePhaseProject[];
}
