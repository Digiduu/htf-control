// Schema del documento "Report progetti Oriens" — Fase 1: generazione statica
// (stesso contenuto calcolato manualmente da Odoo in un'altra sessione, non
// ricalcolato qui). Il calcolo dal vivo da Odoo è esplicitamente fuori scope
// in questa fase (vedi nota nel README dei fixture): questa pagina legge e
// visualizza un documento già pronto.
//
// Molti valori restano stringhe già formattate (es. "11.754,29 € (51,1%)",
// "0 actual / 2,0 bozza (1.200€)") invece di numeri scomposti: il report di
// riferimento mescola importi, percentuali e note di contesto nella stessa
// cella, e forzarli in campi numerici rigidi perderebbe esattamente le
// sfumature che la metodologia del report considera informative.

export interface BafoRow {
  riga: string; // "Baseline" | "Actual" | "Bozza" | "Forecast"
  // Se presente, la riga si mostra come un'unica cella a tutta larghezza con
  // questo testo (es. "n/d — nessuna baseline strutturata") invece delle 5
  // colonne numeriche.
  nd?: string;
  ricavi?: string;
  giornate?: string;
  ricavoMedio?: string;
  costo?: string;
  margine?: string;
}

export interface ConsulenteRow {
  consulente: string;
  ordinate?: string;
  registrate?: string;
  fatturate?: string;
  // Bollino qualità dato: verde (foglio ore ≈ fatturato), giallo (mismatch/
  // da verificare), assente per dipendenti interni o contratti a corpo.
  fatturateDq?: "ok" | "warn" | null;
  costo?: string;
  ricavoProQuota?: string;
  margine?: string;
}

export interface Progetto {
  codice: string;
  nome: string;
  cliente: string;
  stato: string;
  fatturatoLabel: string;
  margineLabel: string;
  margineNeg?: boolean;
  nAnomalie: number;
  // Caso Bordignon: progetto con report dedicato a parte, qui solo totali + link.
  dedicatedReport?: { nota: string; url: string };
  bafo?: BafoRow[];
  consulenti?: ConsulenteRow[];
  altriCosti?: string[];
  anomalie?: string[];
  nota?: string;
}

export interface PmGroup {
  slug: string;
  nome: string;
  countLabel: string; // es. "4 progetti · 26.000 € fatturato"
  progetti: Progetto[];
}

export interface StrategistGroup {
  slug: string;
  nome: string;
  navCount: number;
  riepilogo: string; // es. "12 progetti · fatturato 265.177 € · costo 133.170 € · margine 131.802 € (49.7%)"
  pmGroups: PmGroup[];
}

export interface GiornateRow {
  codice: string;
  progetto: string;
  pm: string;
  consulente: string;
  ordinato: string;
  registrato: string;
  fatturato: string;
  // ROSSO (over) se il fornitore ha fatturato più del registrato a foglio
  // ore; GIALLO (under) se il registrato supera il fatturato (lavoro non
  // ancora fatturato); null/"ok" = coerenti o non confrontabili.
  fatturatoTone?: "over" | "under" | "ok" | null;
  fatturatoTitle?: string;
}

export interface GiornateBlock {
  strategist: string;
  rows: GiornateRow[];
}

export interface OriensReportDoc {
  sottotitolo: string;
  perimetro: string;
  kpi: {
    progettiAttivi: number;
    fatturatoActual: string;
    costoActual: string;
    margineActual: string;
    margineActualPct: string;
    anomalieRilevate: number;
    progettiZero: number;
  };
  strategists: StrategistGroup[];
  giornateIntro: string;
  giornate: GiornateBlock[];
  footerNotes: string[];
}
