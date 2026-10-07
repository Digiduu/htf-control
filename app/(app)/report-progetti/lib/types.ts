// Schema dei documenti di generazione del Report Progetti Digiduu — porting 1:1
// dello schema descritto nel pacchetto di handoff (DATA-SCHEMA.md) e dei
// fixture reali (ALL_PLS nell'Artifact di riferimento).

export interface Invoice {
  date: string;
  due_date: string | null;
  state: "posted" | "draft";
  amount: number;
  number: string | null;
  payment_state:
    | "paid"
    | "in_payment"
    | "partial"
    | "not_paid"
    | "reversed"
    | "blocked"
    | "invoicing_legacy";
  is_credit_note: boolean;
  is_overdue: boolean;
}

export interface PlanningByResource {
  resource: string;
  role: string;
  days: Record<string, number>;
  total: number;
}

export interface PlanningFuture {
  months: string[];
  by_resource: PlanningByResource[];
  total_days: number;
  slot_count: number;
}

export interface Milestone {
  name: string;
  deadline: string | null;
  is_reached: boolean;
  reached_date: string | null;
  source: string | null;
}

export interface TaskStageEntry {
  stage: string;
  count: number;
}

export interface SaleOrder {
  id: number;
  name: string;
  date_start: string | null;
  date_end: string | null;
}

export interface Doc {
  name: string;
  location: string;
  date?: string | null;
  note?: string | null;
}

export interface Group {
  id: number;
  ids: number[];
  name: string;
  partner: string;
  active: boolean;
  stage: string;
  date_start: string | null;
  date_end: string | null;
  chiusura: string | null;
  prop_days: number;
  prop_price: number;
  act_days: number;
  act_rev: number;
  draft_rev: number;
  plan_days: number;
  fc_rev: number;
  days_to_plan: number;
  members: string[];
  member_count: number;
  baseline_excluded: string[];
  sale_orders: SaleOrder[];
  invoices: Invoice[];
  invoiced_total: number;
  draft_total: number;
  paid_total: number;
  planning_future: PlanningFuture;
  tags: string[];
  milestones: Milestone[];
  task_stages: TaskStageEntry[];
  task_total: number;
  sal_docs: Doc[];
  cert_docs: Doc[];
  overdue_total: number;
  overdue_count: number;
  // Giornate a foglio ore con nota Odoo "Omaggio"/"Sospese" (x_studio_nota),
  // sull'intera vita del progetto — non hanno un dettaglio mensile, solo il
  // totale (vedi migration 20261009140000_ppd_omaggio_sospese.sql).
  omaggio_days: number;
  sospese_days: number;
}

export interface ProjectLeaderReport {
  pl_name: string;
  groups: Group[];
  notes: string[];
}

export interface Alert {
  key: "sforamento" | "sal" | "certificato";
  label: string;
  detail: string;
}

export interface RiepSummary {
  activeCount: number;
  totalCount: number;
  prop_days: number;
  prop_price: number;
  act_rev: number;
  fc_rev: number;
  invoiced_total: number;
  alertCount: number;
}
