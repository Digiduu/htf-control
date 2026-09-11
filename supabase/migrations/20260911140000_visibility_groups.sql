-- Gruppi di visualizzazione: secondo asse, ortogonale al ruolo, che decide
-- quali dati della Pipeline Commerciale uno std_user può vedere. Per ora
-- "project_leader" è agganciato solo a Digiduu (unica azienda con dettaglio
-- Project Leader nei dati oggi); se in futuro servirà anche per Oriens andrà
-- estesa la policy sotto, non lo schema.
create type public.user_visibility_group as enum ('global', 'commerciale_digiduu', 'project_leader');

alter table public.profiles
  add column visibility_group public.user_visibility_group not null default 'global';
alter table public.profiles
  add column project_leader_name text;

comment on column public.profiles.visibility_group is
  'Ambito di visibilità della Pipeline Commerciale: global (tutto), commerciale_digiduu (solo azienda Digiduu), project_leader (solo le proprie commesse in Digiduu). Irrilevante per i superadmin, che vedono comunque tutto.';
comment on column public.profiles.project_leader_name is
  'Nome del Project Leader (colonna project_leader dei documenti Pipeline Digiduu) a cui è associato l''utente, valorizzato solo quando visibility_group = ''project_leader''. Il filtro per singola commessa resta applicativo (vedi pipeline-commerciale/page.tsx), non RLS.';

-- La policy "authenticated can read pipeline generations" (migration
-- 20260911120000) dava accesso in lettura a chiunque fosse autenticato, senza
-- distinzione di azienda: qui la sostituiamo con una che rispetta il gruppo.
-- Nessuna ricorsione RLS: la sotto-query su profiles legge solo la riga
-- dell'utente stesso, già leggibile dalla policy "users can read own profile".
drop policy "authenticated can read pipeline generations" on public.pipeline_generations;

create policy "read pipeline generations by visibility group"
  on public.pipeline_generations
  for select
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.visibility_group = 'global'
          or (p.visibility_group in ('commerciale_digiduu', 'project_leader') and pipeline_generations.company = 'digiduu')
        )
    )
  );

-- Elenco dei nomi Project Leader già presenti nei dati Digiduu, per popolare
-- il menu a tendina nell'area Amministrazione (evita di esporre a PostgREST
-- la scomposizione del jsonb, ed evita testo libero soggetto a refusi).
-- Ritorna righe solo per un superadmin: chiunque altro riceve un elenco vuoto.
create function public.digiduu_project_leaders()
returns table (project_leader text)
language sql
stable
security definer set search_path = ''
as $$
  select distinct trim(value ->> 'project_leader')
  from public.pipeline_generations, jsonb_array_elements(data -> 'rows') as value
  where company = 'digiduu'
    and trim(value ->> 'project_leader') is not null
    and trim(value ->> 'project_leader') <> ''
    and public.is_superadmin()
  order by 1;
$$;

grant execute on function public.digiduu_project_leaders() to authenticated;
