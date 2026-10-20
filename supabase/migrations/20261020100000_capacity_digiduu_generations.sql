-- Capacity Digiduu: giornate assegnate nel Planning Odoo (pubblicate e in
-- bozza) rispetto all'obiettivo mensile gg di ogni dipendente Digiduu.
-- Stesso pattern di report_progetti_oriens_generations: una riga per data di
-- generazione con il documento JSON completo (prodotto da
-- scripts/build-capacity-fixture.mjs e caricato con
-- scripts/load-odoo-sync.mjs --capacity <data>).
--
-- Modulo in anteprima: la pagina è visibile solo a una lista ristretta di
-- utenti (vedi requireCapacityAccess() in app/lib/auth/dal.ts). Qui la RLS
-- limita comunque la lettura ai soli superadmin, così i dati non escono anche
-- se qualcuno interroga la tabella direttamente.
create table if not exists public.capacity_digiduu_generations (
  date date primary key,
  data jsonb not null,
  generated_by text,
  created_at timestamptz not null default now()
);

comment on table public.capacity_digiduu_generations is
  'Una generazione di Capacity Digiduu (Planning Odoo vs obiettivo mensile gg per risorsa e progetto). Scoping fisso a Digiduu S.r.l. (company_id=6). Leggibile solo dai superadmin.';
comment on column public.capacity_digiduu_generations.data is
  'Documento JSON completo: vedi app/(app)/capacity-digiduu/lib/types.ts per lo schema esatto (CapacityDoc).';

alter table public.capacity_digiduu_generations enable row level security;

create policy "read capacity digiduu by superadmin"
  on public.capacity_digiduu_generations
  for select
  to authenticated
  using (public.is_superadmin());
