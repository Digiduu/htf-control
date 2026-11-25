-- Pipeline Commerciale: il documento di una generazione può contenere anche
-- l'anno successivo (campo next_year, prodotto da build-pipeline-fixture.mjs
-- dal 25/11/2026). Per i Project Leader la funzione filtrava solo "rows":
-- senza questa modifica next_year arriverebbe intero (righe di tutti i
-- clienti). Ora next_year viene filtrato con la stessa regola dell'anno
-- principale (solo le righe del PL, riepiloghi a null). Va applicata PRIMA di
-- caricare su Supabase un documento con next_year.

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
  v_next_rows jsonb;
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
      'overall', null,
      'next_year', case when v_data ? 'next_year' then (v_data -> 'next_year') || jsonb_build_object(
        'rows', '[]'::jsonb, 'revenue_summary', null, 'stato_summary', null, 'target_table', null, 'overall', null
      ) else null end
    );
    snapshot_label := v_label;
    return next;
    return;
  end if;

  select coalesce(jsonb_agg(elem), '[]'::jsonb)
    into v_filtered_rows
    from jsonb_array_elements(v_data -> 'rows') elem
    where elem ->> 'project_leader' = v_pl_name;

  -- Anno successivo (campo next_year, dal 25/11/2026): stesse righe filtrate
  -- per Project Leader, riepiloghi azzerati come per l'anno principale.
  select coalesce(jsonb_agg(elem), '[]'::jsonb)
    into v_next_rows
    from jsonb_array_elements(coalesce(v_data -> 'next_year' -> 'rows', '[]'::jsonb)) elem
    where elem ->> 'project_leader' = v_pl_name;

  data := v_data || jsonb_build_object(
    'next_year', case when v_data ? 'next_year' then (v_data -> 'next_year') || jsonb_build_object(
      'rows', v_next_rows, 'revenue_summary', null, 'stato_summary', null, 'target_table', null, 'overall', null
    ) else null end,
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
