-- Area Amministrazione: introduce il concetto di ruolo utente. Per ora solo
-- due ruoli (std_user, superadmin) — lo scoping di visibilità per azienda
-- (ogni utente responsabile solo di alcuni clienti) è rimandato allo sprint
-- successivo e non è modellato qui.
create type public.user_role as enum ('std_user', 'superadmin');

-- Una riga per utente Supabase Auth, con i dati che servono all'area
-- Amministrazione per elencare/gestire gli utenti senza dover interrogare lo
-- schema `auth` (non direttamente leggibile dal client) per ogni operazione.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'std_user',
  banned_until timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Anagrafica applicativa 1:1 con auth.users: ruolo e stato per l''area Amministrazione.';
comment on column public.profiles.email is
  'Copia di auth.users.email, sincronizzata solo alla creazione dell''utente (vedi handle_new_user): oggi l''app non ha un flusso di cambio email, se verrà aggiunto in futuro va anche aggiornata qui.';
comment on column public.profiles.role is
  'std_user o superadmin. I nuovi utenti sono sempre creati come std_user (enforced dal trigger handle_new_user, non solo dall''applicazione).';
comment on column public.profiles.banned_until is
  'Mirror di auth.users.banned_until (impostato da auth.admin.updateUserById), così la pagina Amministrazione può leggere lo stato "disabilitato" via RLS senza un client service-role.';

-- Crea automaticamente la riga profiles per ogni nuovo utente Supabase Auth,
-- sempre con role = 'std_user': così l'invariante "i nuovi utenti sono
-- std_user" vale anche se una Server Action avesse un bug, non solo perché
-- l'app lo fa "per bene".
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    'std_user'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Helper SECURITY DEFINER usato dalle policy sotto: evita ricorsione RLS
-- (una policy su profiles che facesse "select ... from profiles" per
-- verificare il ruolo del chiamante si autoreferenzierebbe).
create function public.is_superadmin()
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'superadmin'
  );
$$;

create policy "users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "superadmins can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_superadmin());

create policy "superadmins can update all profiles"
  on public.profiles
  for update
  to authenticated
  using (public.is_superadmin());
