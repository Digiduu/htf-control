-- Il filtro per Project Leader nella Pipeline Commerciale era solo
-- applicativo (vedi il commento ormai superato in
-- 20260911140000_visibility_groups.sql): un utente con visibility_group
-- 'project_leader' riceveva comunque l'intero documento JSON di Digiduu (tutti
-- i PL, più i pannelli aggregati aziendali) e lo stesso vale per
-- 'commerciale_digiduu' — la pagina si limitava a nasconderli in interfaccia.
-- Chiunque avesse il proprio token di accesso poteva leggere tutto
-- interrogando direttamente /rest/v1/pipeline_generations, bypassando
-- pipeline-commerciale/page.tsx del tutto.
--
-- Qui il confine diventa reale: la tabella non è più leggibile direttamente
-- da chi non ha visibility_group='global' (o è superadmin); l'unico modo per
-- leggerla resta una funzione SECURITY DEFINER che calcola da sola, dal
-- profilo dell'utente autenticato (mai da un parametro passato dal client),
-- cosa quella persona può vedere — un Project Leader riceve solo le proprie
-- righe, con i pannelli aggregati aziendali (revenue_summary, stato_summary,
-- target_table, overall) azzerati, indipendentemente da dual_mode o da un
-- project_leader_name vuoto (che ora blocca tutto, invece di mostrare tutto).

drop policy if exists "read pipeline generations by visibility group" on public.pipeline_generations;

create policy "global visibility can read pipeline generations"
  on public.pipeline_generations
  for select
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.visibility_group = 'global'
    )
  );

-- Elenco date/etichette disponibili per un'azienda: non contiene dati di
-- riga, quindi può restare visibile a chiunque sia già scoping-ammesso
-- sull'azienda (stessa regola di accesso del documento completo).
create or replace function public.pipeline_generation_dates(p_company text)
returns table (date date, snapshot_label text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile record;
begin
  select p.role, p.visibility_group into v_profile
  from public.profiles p
  where p.id = auth.uid();

  if not found then
    return;
  end if;

  if not (
    v_profile.role = 'superadmin'
    or v_profile.visibility_group = 'global'
    or (v_profile.visibility_group in ('commerciale_digiduu', 'project_leader') and p_company = 'digiduu')
  ) then
    return;
  end if;

  return query
    select g.date, g.snapshot_label
    from public.pipeline_generations g
    where g.company = p_company
    order by g.date asc;
end;
$$;

grant execute on function public.pipeline_generation_dates(text) to authenticated;

-- Documento di una generazione, filtrato per chi lo chiede. Unico punto
-- autorizzato a leggere `data` per chi non ha visibility_group='global'.
create or replace function public.pipeline_generation_for_viewer(p_company text, p_date date)
returns table (data jsonb, snapshot_label text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_data jsonb;
  v_label text;
  v_pl_name text;
  v_filtered_rows jsonb;
begin
  select p.role, p.visibility_group, p.project_leader_name into v_profile
  from public.profiles p
  where p.id = auth.uid();

  if not found then
    return;
  end if;

  if not (
    v_profile.role = 'superadmin'
    or v_profile.visibility_group = 'global'
    or (v_profile.visibility_group in ('commerciale_digiduu', 'project_leader') and p_company = 'digiduu')
  ) then
    return;
  end if;

  select g.data, g.snapshot_label into v_data, v_label
  from public.pipeline_generations g
  where g.company = p_company and g.date = p_date;

  if not found then
    return;
  end if;

  -- Global/superadmin e commerciale_digiduu vedono il documento intero
  -- (commerciale_digiduu è già scoping-ammesso alla sola azienda Digiduu
  -- dal controllo sopra, nessun filtro per singolo PL da applicare).
  if v_profile.role = 'superadmin' or v_profile.visibility_group in ('global', 'commerciale_digiduu') then
    data := v_data;
    snapshot_label := v_label;
    return next;
    return;
  end if;

  -- Da qui in poi: visibility_group = 'project_leader'. Un nome vuoto blocca
  -- tutto (fail closed), invece di restituire il documento intero com'era
  -- possibile prima di questa migration.
  v_pl_name := nullif(btrim(v_profile.project_leader_name), '');
  if v_pl_name is null then
    data := v_data || jsonb_build_object(
      'rows', '[]'::jsonb,
      'revenue_summary', null,
      'stato_summary', null,
      'target_table', null,
      'overall', null
    );
    snapshot_label := v_label;
    return next;
    return;
  end if;

  select coalesce(jsonb_agg(elem), '[]'::jsonb)
    into v_filtered_rows
    from jsonb_array_elements(v_data -> 'rows') elem
    where elem ->> 'project_leader' = v_pl_name;

  data := v_data || jsonb_build_object(
    'rows', v_filtered_rows,
    'revenue_summary', null,
    'stato_summary', null,
    'target_table', null,
    'overall', null
  );
  snapshot_label := v_label;
  return next;
end;
$$;

grant execute on function public.pipeline_generation_for_viewer(text, date) to authenticated;
