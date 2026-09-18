-- Accesso ai moduli: nuovo asse, ortogonale sia al ruolo sia al
-- visibility_group esistenti. Questi ultimi due controllano QUALI DATI un
-- utente vede dentro una pagina (es. solo Digiduu, solo le proprie commesse);
-- module_access controlla invece QUALI PAGINE del sito un utente può
-- raggiungere. Un superadmin vede comunque tutto a prescindere da questo
-- campo (stessa convenzione di role/visibility_group).
create type public.user_module_access as enum ('all', 'pipeline_commerciale_only');

alter table public.profiles
  add column module_access public.user_module_access not null default 'all';

comment on column public.profiles.module_access is
  'Quali moduli/pagine del sito un utente può raggiungere: "all" (tutti, default) o "pipeline_commerciale_only" (solo la Pipeline Commerciale — usato per i profili commerciali). Irrilevante per i superadmin, che vedono comunque tutto. Applicativo (Sidebar + redirect nelle pagine), non enforced via RLS: i dati restano comunque protetti dalle policy esistenti per company/visibility_group.';
