-- Portfolio Progetti Digiduu: giornate "Omaggio" e "Sospese" (campo Odoo
-- account.analytic.line.x_studio_nota, selezione "Omaggio"/"Sospese" sulle
-- righe di foglio ore) — totali sull'intera vita del progetto, sommati sui
-- membri del gruppo (stesso principio di act_days). Richiesto per evidenziare
-- quante giornate consuntivate non generano/non generano ancora fatturato per
-- scelta esplicita (omaggio) o perché in sospeso (da chiarire col cliente),
-- a differenza delle giornate semplicemente non ancora fatturate.
alter table public.ppd_project_groups
  add column omaggio_days numeric not null default 0,
  add column sospese_days numeric not null default 0;

comment on column public.ppd_project_groups.omaggio_days is
  'Giornate a foglio ore con nota Odoo "Omaggio" (account.analytic.line.x_studio_nota), sommate sui membri del gruppo. Ore/8, come act_days.';
comment on column public.ppd_project_groups.sospese_days is
  'Giornate a foglio ore con nota Odoo "Sospese" (account.analytic.line.x_studio_nota), sommate sui membri del gruppo. Ore/8, come act_days.';
