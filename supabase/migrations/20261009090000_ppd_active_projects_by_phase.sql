-- "Progetti attivi per fase" (prompt di handoff §6.3), dentro il Recap
-- globale di Portfolio Progetti Digiduu. A differenza del resto del modulo,
-- qui si contano i singoli progetti Odoo (non i gruppi/progetti padre): un
-- progetto padre può unire più progetti Odoo con fase diversa, quindi questo
-- conteggio vive in una tabella propria invece di essere derivato da
-- ppd_project_groups. Riservata, anche a livello di RLS, a chi ha
-- visibility_group='global' o e' superadmin — stesso perimetro del resto del
-- Recap globale (vedi requireGlobalVisibility in app/lib/auth/dal.ts).
create table if not exists public.ppd_active_projects_by_phase (
  id integer primary key, -- id del progetto Odoo (project.project), non del gruppo
  sync_run_id uuid references public.ppd_sync_runs(id) on delete cascade,
  pl_name text not null,
  project_name text not null,
  stage text not null check (stage in ('Da fare', 'In corso')),
  is_assistenza boolean not null default false
);

comment on table public.ppd_active_projects_by_phase is
  'Singoli progetti Odoo Digiduu non archiviati, in fase "Da fare" o "In corso" (esclusi quelli in fase o con etichetta "Non aggiornare"). Usata solo per la sezione "Progetti attivi per fase" del Recap globale — non centra con il raggruppamento per Progetto Padre del resto del modulo.';
comment on column public.ppd_active_projects_by_phase.is_assistenza is
  'Vero se il progetto ha l''etichetta Odoo "Assistenza" tra le sue etichette (anche se ne ha altre).';

alter table public.ppd_active_projects_by_phase enable row level security;

create policy "read ppd active projects by phase by global visibility"
  on public.ppd_active_projects_by_phase
  for select
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.visibility_group = 'global'
    )
  );
