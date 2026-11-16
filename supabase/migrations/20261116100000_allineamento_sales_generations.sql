-- Allineamenti Sales Digiduu: dashboard per gli allineamenti commerciali
-- (opportunità CRM, storico modifiche, attività, pipeline commerciale).
-- Stesso pattern di report_assistenza_generations: una riga per data di
-- estrazione con il documento JSON completo (fixtures/allineamento-sales/
-- <data>.json, caricato con scripts/load-odoo-sync.mjs --allineamento-sales
-- <data>).
--
-- La pagina è visibile a superadmin, visibilità "global" e commerciali
-- Digiduu (vedi requireAllineamentiSalesAccess() in app/lib/auth/dal.ts),
-- che la legge con il client service role dopo quel controllo. Qui la RLS
-- limita comunque la lettura diretta ai soli superadmin.
create table if not exists public.allineamento_sales_generations (
  date date primary key,
  data jsonb not null,
  generated_by text,
  created_at timestamptz not null default now()
);

comment on table public.allineamento_sales_generations is
  'Una estrazione per gli Allineamenti Sales Digiduu (opportunità CRM, tracking, attività, pipeline commerciale). Scoping fisso a Digiduu S.r.l. (company_id=6). Leggibile direttamente solo dai superadmin.';
comment on column public.allineamento_sales_generations.data is
  'Documento JSON completo: schema di data.json del template allineamento_sales_template.html (extracted, budget, leads, tracking, activities, pipeline, pipeMonthly, leadOrders, planCovered, planUnlinked).';

alter table public.allineamento_sales_generations enable row level security;

create policy "read allineamento sales by superadmin"
  on public.allineamento_sales_generations
  for select
  to authenticated
  using (public.is_superadmin());
