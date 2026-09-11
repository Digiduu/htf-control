// Schema dei documenti di generazione della Pipeline Commerciale — porting 1:1
// dello schema descritto nell'handoff (sezione 3.1) e dei fixture reali.

export type Company = "oriens" | "digiduu";

export interface PipelineRow {
  cliente: string;
  origine: string | null;
  is_crm: boolean;
  crm_comment: string | null;
  account: string | null;
  project_leader: string | null;
  referente: string | null;
  stato: string | null;
  ordinato: number | null;
  months: (number | null)[];
  totale: number | null;
  nota: string | null;
}

export interface StatoSummaryEntry {
  stato: string;
  color: string;
  months: number[];
  totale: number;
}

export interface TargetTableEntry {
  cliente: string | null;
  label?: string;
  ordinato: number;
  target: number;
  differenza: number;
}

export interface RevenueStep {
  label: string;
  op: string | null;
  value: number;
  bold?: boolean;
  highlight?: boolean;
}

export interface RevenueSummary {
  as_of: string;
  year: number;
  steps: RevenueStep[];
  source_note?: string;
  by_project_leader?: Record<string, RevenueStep[]>;
}

export interface PipelineDoc {
  label: string;
  year: number;
  generated_at: string | null;
  dual_mode: boolean;
  headers: string[] | null;
  source_note?: string | null;
  rows: PipelineRow[];
  overall: { ordinato: number | null; months: (number | null)[]; totale: number | null };
  stato_summary: StatoSummaryEntry[];
  target_table: TargetTableEntry[];
  revenue_summary?: RevenueSummary;
}
