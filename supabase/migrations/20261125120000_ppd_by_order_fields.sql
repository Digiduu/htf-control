-- Portfolio Progetti Digiduu: campi della logica "per ordine di vendita"
-- (build-portfolio-fixture.mjs dal 23/11/2026). Tutti facoltativi: se vuoti la
-- pagina si comporta come prima. Va applicata PRIMA di caricare su Supabase
-- una generazione che li contiene (load-odoo-sync.mjs --portfolio).
alter table public.ppd_project_groups
  add column if not exists update_status text,
  add column if not exists spent_by_resource jsonb,
  add column if not exists baseline_missing jsonb,
  add column if not exists fc_consuntivi numeric,
  add column if not exists fc_consuntivi_lines jsonb;

comment on column public.ppd_project_groups.update_status is
  'Stato di avanzamento Odoo del progetto canonico (project.project.last_update_status: on_track / at_risk / off_track / on_hold / to_define / done).';
comment on column public.ppd_project_groups.spent_by_resource is
  'Giornate spese per persona dal mese corrente: { "<risorsa>": { "YYYY-MM": giornate } }.';
comment on column public.ppd_project_groups.baseline_missing is
  'Nomi degli ordini di vendita del gruppo senza "Prezzo indicato in proposta" (array JSON di stringhe).';
comment on column public.ppd_project_groups.fc_consuntivi is
  'Previsioni di fattura a consuntivo (piano di fatturazione, stato "Consuntivi") incluse nei Ricavi forecast.';
comment on column public.ppd_project_groups.fc_consuntivi_lines is
  'Dettaglio delle previsioni a consuntivo: [{ date, name, amount, order }].';
