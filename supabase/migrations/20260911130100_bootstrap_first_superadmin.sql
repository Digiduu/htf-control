-- Promuove il primo superadmin, una tantum, così l'area Amministrazione ha
-- un accesso iniziale senza dover passare dallo SQL Editor a mano.
-- No-op idempotente se questo utente non esiste ancora nell'ambiente target
-- (es. un DB locale appena creato): va creato prima quell'account Supabase
-- Auth perché la promozione abbia effetto.
update public.profiles
set role = 'superadmin'
where id = (select id from auth.users where email = 'c.rossetto@oriens.consulting');
