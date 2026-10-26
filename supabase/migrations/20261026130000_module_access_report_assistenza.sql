-- Nuovo livello di "Accesso moduli" (vedi 20260918100000_module_access.sql
-- per il concetto): "report_assistenza_only", per chi deve vedere solo il
-- Report Assistenza (pagina d'ingresso /report-assistenza, nessuna altra voce
-- di menu, Pipeline Commerciale rimandata altrove). Resta un controllo
-- applicativo (Sidebar + redirect nelle pagine), non enforced via RLS.
--
-- Come per 20261009120000_module_access_digiduu_oriens.sql, ALTER TYPE ...
-- ADD VALUE non può essere usato nella stessa transazione in cui il nuovo
-- valore viene letto/scritto: qui si aggiunge solo il valore.
alter type public.user_module_access add value if not exists 'report_assistenza_only';
