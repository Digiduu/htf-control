-- Report Assistenza Digiduu: progetti di assistenza in corso con ore
-- previste, date di contratto, fatturato e ore spese mese per mese. Stesso
-- pattern di capacity_digiduu_generations: una riga per data di generazione
-- con il documento JSON completo (prodotto da
-- scripts/build-assistenza-fixture.mjs e caricato con
-- scripts/load-odoo-sync.mjs --assistenza <data>).
--
-- La pagina è visibile solo a una lista ristretta di utenti (vedi
-- requireReportAssistenzaAccess() in app/lib/auth/dal.ts). Qui la RLS limita
-- comunque la lettura ai soli superadmin, così i dati non escono anche se
-- qualcuno interroga la tabella direttamente.
create table if not exists public.report_assistenza_generations (
  date date primary key,
  data jsonb not null,
  generated_by text,
  created_at timestamptz not null default now()
);

comment on table public.report_assistenza_generations is
  'Una generazione del Report Assistenza Digiduu (progetti con etichetta Assistenza in corso: ore previste, fatturato e ore mensili). Scoping fisso a Digiduu S.r.l. (company_id=6). Leggibile solo dai superadmin.';
comment on column public.report_assistenza_generations.data is
  'Documento JSON completo: vedi app/(app)/report-assistenza/lib/types.ts per lo schema esatto (AssistenzaDoc).';

alter table public.report_assistenza_generations enable row level security;

create policy "read report assistenza by superadmin"
  on public.report_assistenza_generations
  for select
  to authenticated
  using (public.is_superadmin());
