-- Il trigger handle_new_user (migration 20260911130000) scatta solo sui
-- NUOVI insert in auth.users: gli utenti già esistenti prima di quella
-- migration (incluso c.rossetto@oriens.consulting) non ci sono mai passati
-- e non hanno ancora una riga profiles — per questo il bootstrap in
-- 20260911130100 non ha trovato nulla da promuovere. Qui creiamo le righe
-- mancanti per tutti gli utenti Auth pre-esistenti (come std_user) e
-- ripetiamo la promozione a superadmin. Idempotente: sicura da rieseguire.
insert into public.profiles (id, email, full_name, role)
select u.id, u.email, u.raw_user_meta_data ->> 'full_name', 'std_user'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

update public.profiles
set role = 'superadmin'
where id = (select id from auth.users where email = 'c.rossetto@oriens.consulting');
