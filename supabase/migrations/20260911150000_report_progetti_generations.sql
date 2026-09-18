-- Report Progetti Digiduu: porting 1:1 dei documenti di generazione
-- dell'Artifact "Report progetti Digiduu — Riepilogo Project Leader" (vedi
-- HANDOFF.md / DATA-SCHEMA.md del pacchetto di handoff) in una singola tabella
-- JSONB. Una riga per data di generazione; il payload intero (array di Project
-- Leader, ciascuno con i propri "progetti padre" / gruppi) vive in `data` così
-- com'è nei fixture, senza rimodellazione relazionale in questa fase.
--
-- A differenza di pipeline_generations non c'è colonna "company": questo
-- report è per costruzione limitato a Digiduu S.r.l. (company_id=6, vedi
-- BUSINESS-LOGIC.md §1 dell'handoff), quindi non c'è nulla da distinguere a
-- livello di riga.
create table if not exists public.report_progetti_generations (
  date date primary key,
  data jsonb not null,
  generated_by text,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.report_progetti_generations is
  'Una generazione storica del Report Progetti Digiduu (Riepilogo Project Leader), porting 1:1 dei fixture dell''Artifact claude.ai originale. Scoping fisso a Digiduu S.r.l.';
comment on column public.report_progetti_generations.data is
  'Documento JSON completo: array di {pl_name, groups[], notes[]} — vedi DATA-SCHEMA.md del pacchetto di handoff per lo schema esatto di ogni gruppo (progetto padre).';
comment on column public.report_progetti_generations.generated_by is
  'Descrizione libera di come/da chi è stata prodotta la generazione (es. "Sessione Claude + MCP Odoo/SharePoint"), per trasparenza — non è un vincolo di integrità referenziale.';

alter table public.report_progetti_generations enable row level security;

-- Sola lettura per gli utenti autenticati (nessuna scrittura dal client: i
-- dati arrivano da uno script di import / futuro job Odoo+SharePoint con
-- service_role, mai dall'app stessa — il report resta di sola lettura, come
-- nell'Artifact). Non c'è bisogno di distinguere per visibility_group a
-- livello di riga (un'unica azienda, un'unica riga per data): la restrizione
-- "un Project Leader vede solo il proprio portfolio" resta applicativa, non
-- RLS — stesso trade-off già accettato per il filtro Project Leader della
-- Pipeline Commerciale (vedi commento in 20260911140000_visibility_groups.sql).
create policy "authenticated can read report progetti generations"
  on public.report_progetti_generations
  for select
  to authenticated
  using (true);
