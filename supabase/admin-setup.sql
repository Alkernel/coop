-- ==========================================================
-- COOP ADMIN SETUP — run this ONE file in the Supabase SQL Editor.
-- Creates only what the /admin page needs. Safe to re-run.
-- ==========================================================

create extension if not exists pgcrypto;

-- 1. Admin users (Supabase Auth email + password login)
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.admin_users enable row level security;

-- 2. Is the signed-in user an admin?
create or replace function public.rpc_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    exists (select 1 from public.admin_users where user_id = auth.uid()),
    false
  );
$$;

-- 3. Verify the fallback admin key (hash compare, server-side)
create or replace function public.rpc_verify_admin_key(p_admin_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (select admin_key_hash from public.admin_settings where id = 'default') is not null
    and encode(digest(p_admin_key, 'sha256'), 'hex')
        = (select admin_key_hash from public.admin_settings where id = 'default'),
    false
  );
$$;

-- 4. Set / reset the admin key directly (run once from SQL editor)
create or replace function public.rpc_set_admin_key(p_admin_key text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_admin_key is null or length(p_admin_key) < 8 then
    raise exception 'Admin key must be at least 8 characters';
  end if;
  insert into public.admin_settings (id, admin_key_hash)
  values ('default', encode(digest(p_admin_key, 'sha256'), 'hex'))
  on conflict (id) do update
    set admin_key_hash = excluded.admin_key_hash,
        updated_at = now();
  return true;
end;
$$;

-- 5. Public settings read (needed by the /admin page AND the wallet app)
create or replace function public.rpc_get_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'base_mining_rate', base_mining_rate,
    'daily_mining_hours', daily_mining_hours,
    'points_per_coop', points_per_coop,
    'daily_conversion_limit_points', daily_conversion_limit_points,
    'total_coop_reward_pool', total_coop_reward_pool,
    'remaining_coop_reward_pool', remaining_coop_reward_pool,
    'mining_enabled', mining_enabled,
    'conversion_enabled', conversion_enabled,
    'boost_purchases_enabled', boost_purchases_enabled,
    'boosts_stackable', boosts_stackable,
    'swap_rate_limit_seconds', swap_rate_limit_seconds,
    'boost_tiers', boost_tiers
  )
  from public.admin_settings where id = 'default';
$$;

-- 6. Update settings (signed-in admin OR valid admin key)
create or replace function public.rpc_admin_set_settings(
  p_admin_key text,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_is_auth_admin boolean;
  v_key_hash text;
begin
  v_is_auth_admin := coalesce(
    exists (select 1 from public.admin_users where user_id = auth.uid()),
    false
  );
  if not v_is_auth_admin then
    v_key_hash := coalesce(
      (select admin_key_hash from public.admin_settings where id = 'default'), '');
    if v_key_hash = '' then
      raise exception 'Admin is not configured. Promote an admin user or set the admin key first.';
    end if;
    if p_admin_key is null
       or encode(digest(p_admin_key, 'sha256'), 'hex') <> v_key_hash then
      raise exception 'Unauthorized';
    end if;
  end if;

  if p_updates ? 'base_mining_rate' then
    update public.admin_settings set base_mining_rate = (p_updates->>'base_mining_rate')::numeric where id = 'default';
  end if;
  if p_updates ? 'daily_mining_hours' then
    update public.admin_settings set daily_mining_hours = (p_updates->>'daily_mining_hours')::numeric where id = 'default';
  end if;
  if p_updates ? 'points_per_coop' then
    update public.admin_settings set points_per_coop = (p_updates->>'points_per_coop')::numeric where id = 'default';
  end if;
  if p_updates ? 'daily_conversion_limit_points' then
    update public.admin_settings set daily_conversion_limit_points = (p_updates->>'daily_conversion_limit_points')::numeric where id = 'default';
  end if;
  if p_updates ? 'total_coop_reward_pool' then
    update public.admin_settings set total_coop_reward_pool = (p_updates->>'total_coop_reward_pool')::numeric where id = 'default';
  end if;
  if p_updates ? 'remaining_coop_reward_pool' then
    update public.admin_settings set remaining_coop_reward_pool = (p_updates->>'remaining_coop_reward_pool')::numeric where id = 'default';
  end if;
  if p_updates ? 'mining_enabled' then
    update public.admin_settings set mining_enabled = (p_updates->>'mining_enabled')::boolean where id = 'default';
  end if;
  if p_updates ? 'conversion_enabled' then
    update public.admin_settings set conversion_enabled = (p_updates->>'conversion_enabled')::boolean where id = 'default';
  end if;
  if p_updates ? 'boost_purchases_enabled' then
    update public.admin_settings set boost_purchases_enabled = (p_updates->>'boost_purchases_enabled')::boolean where id = 'default';
  end if;
  if p_updates ? 'boosts_stackable' then
    update public.admin_settings set boosts_stackable = (p_updates->>'boosts_stackable')::boolean where id = 'default';
  end if;
  if p_updates ? 'swap_rate_limit_seconds' then
    update public.admin_settings set swap_rate_limit_seconds = (p_updates->>'swap_rate_limit_seconds')::integer where id = 'default';
  end if;
  if p_updates ? 'boost_tiers' then
    update public.admin_settings set boost_tiers = (p_updates->'boost_tiers') where id = 'default';
  end if;

  return jsonb_build_object('success', true);
end;
$$;

-- 7. Allow anyone to call these (the functions check permissions internally)
grant execute on function public.rpc_is_admin() to anon, authenticated;
grant execute on function public.rpc_verify_admin_key(text) to anon, authenticated;
grant execute on function public.rpc_get_settings() to anon, authenticated;
grant execute on function public.rpc_admin_set_settings(text, jsonb) to anon, authenticated;

-- ==========================================================
-- 8. FINALLY — give YOUR email admin access.
--    Replace 'you@gmail.com' with the Gmail you used when you
--    created the admin user in Supabase Auth, then RUN THIS TOO:
--
-- insert into public.admin_users (user_id, email)
-- select id, email from auth.users where email = 'you@gmail.com'
-- on conflict (user_id) do nothing;
-- ==========================================================