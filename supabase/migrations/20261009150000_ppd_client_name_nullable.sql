-- Alcuni gruppi non hanno un cliente reale (bucket interni/di capacity come
-- "Progetti interni", "Formazione", "Alba Continuazione Crescita", nati
-- dall'inclusione dei gruppi "Nessun PL assegnato" nella sync del 2026-10-08):
-- per questi client_name è legittimamente assente, non un dato mancante.
-- La UI (clientNameOf in lib/logic.ts) già tollera un partner vuoto/null.
alter table public.ppd_project_groups
  alter column client_name drop not null;
