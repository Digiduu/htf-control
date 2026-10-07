-- Report Progetti Oriens: stesso pattern di report_progetti_generations
-- (Digiduu), ma con due differenze deliberate:
-- 1) riservato a chi ha visibilità "global" o è superadmin (vedi
--    requireGlobalVisibility() in app/lib/auth/dal.ts) — qui il controllo va
--    fatto anche a livello di RLS, non solo in pagina, perché il perimetro è
--    esplicitamente "solo utenti con permessi massimi" (vedi prompt di
--    handoff "Report progetti Oriens", §1);
-- 2) Fase 1: nessuna connessione dal vivo a Odoo in questo progetto (vedi
--    fixtures/README.md) — la tabella ospita generazioni statiche, stesso
--    schema di dato che userebbe un futuro job Odoo, non il calcolo stesso.
create table if not exists public.report_progetti_oriens_generations (
  date date primary key,
  data jsonb not null,
  generated_by text,
  created_at timestamptz not null default now()
);

comment on table public.report_progetti_oriens_generations is
  'Una generazione storica del Report Progetti Oriens (Strategist -> PM -> progetto). Scoping fisso a Oriens Consulting S.r.l. Riservata, anche a livello di RLS, a chi ha visibility_group=global o e'' superadmin.';
comment on column public.report_progetti_oriens_generations.data is
  'Documento JSON completo: vedi app/(app)/report-progetti-oriens/lib/types.ts per lo schema esatto (OriensReportDoc).';
comment on column public.report_progetti_oriens_generations.generated_by is
  'Descrizione libera di come/da chi e'' stata prodotta la generazione (es. "Sessione Claude + MCP Odoo"), per trasparenza.';

alter table public.report_progetti_oriens_generations enable row level security;

create policy "read report progetti oriens by global visibility"
  on public.report_progetti_oriens_generations
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
