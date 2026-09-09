-- ============================================================
-- PROMOTE AN ADMIN (run once in Supabase SQL Editor)
-- Adds your Supabase Auth user to the admin list by email.
-- Re-running is safe (upsert). Works even if you deleted and
-- re-created the auth user, because it looks up the CURRENT id.
-- ============================================================

insert into public.admin_users (user_id, email)
select id, email from auth.users where email = 'Alkernel410@gmail.com'
on conflict (user_id) do update set email = excluded.email;

-- Verify: should return exactly one row with your email
select * from public.admin_users;
