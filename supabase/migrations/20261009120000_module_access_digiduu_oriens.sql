-- Due nuovi livelli di "Accesso moduli" (vedi 20260918100000_module_access.sql
-- per il concetto): oltre a "all" e "pipeline_commerciale_only" (tutta la
-- Pipeline Commerciale), un utente può essere limitato ai moduli di una sola
-- azienda — "digiduu" (Pipeline Commerciale + Portfolio Progetti Digiduu) o
-- "oriens" (Pipeline Commerciale + Report Progetti Oriens). Resta un
-- controllo applicativo (Sidebar + redirect nelle pagine), non enforced via
-- RLS — i dati restano comunque protetti dalle policy esistenti.
--
-- ALTER TYPE ... ADD VALUE non può essere usato nella stessa transazione in
-- cui il nuovo valore viene letto/scritto: questa migration si limita ad
-- aggiungere i valori, l'uso effettivo (form di Amministrazione) avviene in
-- richieste successive.
alter type public.user_module_access add value if not exists 'digiduu';
alter type public.user_module_access add value if not exists 'oriens';
