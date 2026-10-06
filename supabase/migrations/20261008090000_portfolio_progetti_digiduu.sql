-- Portfolio Progetti Digiduu: evoluzione di "Report Progetti Digiduu"
-- (report_progetti_generations) con schema granulare e RLS reali per
-- Project Leader, invece di un'unica policy "using (true)" e un filtro solo
-- lato client (vedi app/(app)/report-progetti/page.tsx). Scoping fisso a
-- Digiduu S.r.l. (company_id=6 in Odoo), nessuna colonna "company" — stesso
-- principio già usato per report_progetti_generations.
--
-- Chiave dei gruppi ("progetto padre" del conto analitico, vedi prompt di
-- handoff "Portfolio Progetti Digiduu" §2.2): l'id Odoo del progetto
-- canonico, stabile tra reimport, non un uuid generato qui.
--
-- Fase 1 (dati esistenti, nessuna sync automatica): i dati entrano solo via
-- SQL incollato a mano in Supabase Studio (scripts/import-portfolio-progetti-
-- digiduu-fixtures.mjs), stesso identico procedimento già in uso per tutti
-- gli altri moduli di questo sito.

-- Collegamento utente -> Project Leader Odoo: oggi il solo collegamento è
-- testuale (profiles.project_leader_name, confrontato per stringa). Questa
-- colonna è il percorso di miglioramento verso un collegamento stabile per
-- id; finché resta vuota la RLS usa il confronto testuale esistente come
-- transizione morbida (vedi ppd_can_see_group più sotto).
alter table public.profiles
  add column odoo_partner_id integer;

comment on column public.profiles.odoo_partner_id is
  'Id del contatto Odoo (partner_project_leader_id) collegato a questo utente, impostato a mano dall''admin. Se null, la RLS di Portfolio Progetti Digiduu usa come fallback il confronto testuale su project_leader_name.';

create table public.ppd_sync_runs (
  id uuid primary key default gen_random_uuid(),
  data_as_of date not null unique,
  generated_by text,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.ppd_sync_runs is
  'Una "generazione" di dati Portfolio Progetti Digiduu (una per data_as_of), stesso ruolo di pipeline_generations/report_progetti_generations ma con dato spezzato su più tabelle invece di un unico jsonb.';

create table public.ppd_project_groups (
  id integer primary key,
  sync_run_id uuid references public.ppd_sync_runs (id) on delete set null,
  pl_name text not null,
  pl_odoo_partner_id integer,
  client_name text not null,
  name text not null,
  active boolean not null,
  stage text not null,
  date_start date,
  date_end date,
  chiusura date,
  prop_days numeric,
  prop_price numeric,
  act_days numeric,
  act_rev numeric,
  draft_rev numeric,
  plan_days numeric,
  fc_rev numeric,
  member_ids integer[] not null default '{}',
  member_names text[] not null default '{}',
  baseline_excluded text[] not null default '{}',
  tags text[] not null default '{}',
  invoiced_total numeric,
  draft_total numeric,
  paid_total numeric,
  overdue_total numeric,
  overdue_count integer,
  task_total integer
);

comment on table public.ppd_project_groups is
  'Una riga per "progetto padre" (gruppo), la chiave che governa tutto il report: vedi prompt di handoff §2.2. id = id Odoo del progetto canonico.';
comment on column public.ppd_project_groups.baseline_excluded is
  'Nomi dei progetti figli esclusi dal conteggio di prop_days/prop_price per evitare di contare due volte lo stesso ordine di vendita (vedi §2.4 del prompt).';

create table public.ppd_sale_orders (
  group_id integer not null references public.ppd_project_groups (id) on delete cascade,
  order_id integer,
  name text,
  date_start date,
  date_end date
);

create table public.ppd_invoices (
  id uuid primary key default gen_random_uuid(),
  group_id integer not null references public.ppd_project_groups (id) on delete cascade,
  invoice_date date,
  due_date date,
  state text,
  amount numeric,
  number text,
  payment_state text,
  is_credit_note boolean not null default false,
  is_overdue boolean not null default false
);

create table public.ppd_planning_future (
  group_id integer not null references public.ppd_project_groups (id) on delete cascade,
  resource text not null,
  role text,
  month text not null,
  days numeric not null default 0
);

comment on table public.ppd_planning_future is
  'Pianificazione futura appiattita in righe risorsa x mese (da planning_future.by_resource[].days della generazione attuale). month in formato YYYY-MM.';

create table public.ppd_timesheet_monthly (
  group_id integer not null references public.ppd_project_groups (id) on delete cascade,
  month text not null,
  days numeric not null default 0
);

comment on table public.ppd_timesheet_monthly is
  'Giornate registrate a foglio ore per mese (account.analytic.line, ore/8), sommate su tutti i progetti del gruppo. month in formato YYYY-MM. A differenza della prima versione di questo modulo, questo dato è reale e sincronizzato da Odoo, non più un limite noto.';

create table public.ppd_milestones (
  id uuid primary key default gen_random_uuid(),
  group_id integer not null references public.ppd_project_groups (id) on delete cascade,
  name text not null,
  deadline date,
  is_reached boolean not null default false,
  reached_date date,
  source text
);

create table public.ppd_task_stages (
  group_id integer not null references public.ppd_project_groups (id) on delete cascade,
  stage text not null,
  count integer not null default 0
);

create table public.ppd_documents (
  id uuid primary key default gen_random_uuid(),
  group_id integer not null references public.ppd_project_groups (id) on delete cascade,
  kind text not null check (kind in ('sal', 'certificato')),
  name text not null,
  location text,
  doc_date date,
  note text
);

create table public.ppd_analysis_notes (
  group_id integer primary key references public.ppd_project_groups (id) on delete cascade,
  note text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

comment on table public.ppd_analysis_notes is
  'Note di analisi scritte a mano (Appendice A del prompt di handoff), modificabili solo da superadmin.';

create table public.ppd_pl_notes (
  id uuid primary key default gen_random_uuid(),
  pl_name text not null,
  note text not null
);

comment on table public.ppd_pl_notes is
  'Note libere a livello di Project Leader (non legate a un singolo gruppo), es. esclusioni di scoping segnalate durante l''import.';

-- RLS: helper riusato da tutte le tabelle figlie per evitare di ripetere 7
-- volte la stessa condizione di visibilità (stesso principio di is_superadmin()).
create function public.ppd_can_see_group(p_group_id integer)
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.ppd_project_groups g
    join public.profiles p on p.id = auth.uid()
    where g.id = p_group_id
      and (
        public.is_superadmin()
        or p.visibility_group = 'global'
        or (p.odoo_partner_id is not null and p.odoo_partner_id = g.pl_odoo_partner_id)
        or (p.odoo_partner_id is null and p.project_leader_name = g.pl_name)
      )
  );
$$;

comment on function public.ppd_can_see_group is
  'true se l''utente corrente può vedere il gruppo p_group_id: superadmin o visibility_group=global vedono tutto, altrimenti solo se collegato come Project Leader del gruppo (per odoo_partner_id se impostato, altrimenti per confronto testuale su project_leader_name come transizione).';

alter table public.ppd_sync_runs enable row level security;
alter table public.ppd_project_groups enable row level security;
alter table public.ppd_sale_orders enable row level security;
alter table public.ppd_invoices enable row level security;
alter table public.ppd_planning_future enable row level security;
alter table public.ppd_timesheet_monthly enable row level security;
alter table public.ppd_milestones enable row level security;
alter table public.ppd_task_stages enable row level security;
alter table public.ppd_documents enable row level security;
alter table public.ppd_analysis_notes enable row level security;
alter table public.ppd_pl_notes enable row level security;

create policy "authenticated can read ppd sync runs"
  on public.ppd_sync_runs for select to authenticated using (true);

create policy "ppd groups visible to own PL or global"
  on public.ppd_project_groups for select to authenticated
  using (public.ppd_can_see_group(id));

create policy "ppd sale orders visible to own PL or global"
  on public.ppd_sale_orders for select to authenticated
  using (public.ppd_can_see_group(group_id));

create policy "ppd invoices visible to own PL or global"
  on public.ppd_invoices for select to authenticated
  using (public.ppd_can_see_group(group_id));

create policy "ppd planning visible to own PL or global"
  on public.ppd_planning_future for select to authenticated
  using (public.ppd_can_see_group(group_id));

create policy "ppd timesheet monthly visible to own PL or global"
  on public.ppd_timesheet_monthly for select to authenticated
  using (public.ppd_can_see_group(group_id));

create policy "ppd milestones visible to own PL or global"
  on public.ppd_milestones for select to authenticated
  using (public.ppd_can_see_group(group_id));

create policy "ppd task stages visible to own PL or global"
  on public.ppd_task_stages for select to authenticated
  using (public.ppd_can_see_group(group_id));

create policy "ppd documents visible to own PL or global"
  on public.ppd_documents for select to authenticated
  using (public.ppd_can_see_group(group_id));

create policy "ppd analysis notes visible to own PL or global"
  on public.ppd_analysis_notes for select to authenticated
  using (public.ppd_can_see_group(group_id));

create policy "ppd pl notes visible to own PL or global"
  on public.ppd_pl_notes for select to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.visibility_group = 'global' or p.project_leader_name = ppd_pl_notes.pl_name)
    )
  );
