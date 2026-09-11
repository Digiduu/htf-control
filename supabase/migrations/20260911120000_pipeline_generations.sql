-- Pipeline Commerciale: porting quasi 1:1 dei documenti di generazione
-- dell'Artifact (sezione 3.1 dell'handoff) in una singola tabella JSONB.
-- Una riga per (azienda, data di generazione); il payload intero (rows,
-- overall, stato_summary, target_table, revenue_summary, ...) vive in `data`
-- così com'è nei fixture, senza rimodellazione relazionale in questa fase.
create table if not exists public.pipeline_generations (
  company text not null,
  date date not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (company, date)
);

comment on table public.pipeline_generations is
  'Una generazione storica della Pipeline Commerciale per azienda e data, porting 1:1 dei fixture dell''Artifact claude.ai originale.';
comment on column public.pipeline_generations.company is
  'Slug azienda: "oriens" o "digiduu" (stessi nomi delle cartelle fixtures/).';
comment on column public.pipeline_generations.data is
  'Documento JSON completo: label, year, dual_mode, headers, rows[], overall, stato_summary[], target_table[], revenue_summary?, source_note?.';

alter table public.pipeline_generations enable row level security;

-- Sola lettura per gli utenti autenticati (nessuna scrittura dal client:
-- i dati arrivano da uno script di import / futuro job Odoo con service_role,
-- mai dall'app stessa — la pipeline resta di sola lettura, come nell'Artifact).
create policy "authenticated can read pipeline generations"
  on public.pipeline_generations
  for select
  to authenticated
  using (true);
