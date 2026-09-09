-- ==========================================================
-- COOP WALLET — SUPABASE DATABASE SCHEMA & RPC FUNCTIONS (v2)
-- Real server-side mining, bidirectional swap with controlled
-- COOP reward pool, admin settings, locked-down RLS.
-- Run this whole file once in the Supabase SQL Editor.
-- ==========================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------
-- 1. WALLETS (the user table)
-- ----------------------------------------------------------
create table if not exists public.wallets (
  id uuid primary key default uuid_generate_v4(),
  address text unique not null,
  private_key_hash text not null,
  coop_balance numeric(20, 4) not null default 0.0000,
  cooptoken_balance numeric(20, 4) not null default 0.0000,   -- Coopoints (internal reward points)
  total_sent numeric(20, 4) not null default 0.0000,
  total_received numeric(20, 4) not null default 0.0000,
  pin_code text default '123456',
  biometrics_enabled boolean default true,
  notifications_enabled boolean default true,
  auto_lock_minutes integer default 5,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_active_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ----------------------------------------------------------
-- 2. ADMIN SETTINGS (single row 'default')
-- ----------------------------------------------------------
create table if not exists public.admin_settings (
  id text primary key default 'default',
  base_mining_rate numeric(20, 4) not null default 50.0000,
  daily_mining_hours numeric(6, 2) not null default 12.00,
  points_per_coop numeric(20, 4) not null default 10.0000,
  daily_conversion_limit_points numeric(20, 4) not null default 50000.0000,
  total_coop_reward_pool numeric(20, 4) not null default 1000000.0000,
  remaining_coop_reward_pool numeric(20, 4) not null default 1000000.0000,
  mining_enabled boolean not null default true,
  conversion_enabled boolean not null default true,
  boost_purchases_enabled boolean not null default false,
  boosts_stackable boolean not null default false,
  swap_rate_limit_seconds integer not null default 10,
  boost_tiers jsonb not null default '[
    {"id":"starter","name":"Starter","priceUsd":1.00,"boostPct":25,"durationDays":7},
    {"id":"plus","name":"Plus","priceUsd":2.50,"boostPct":50,"durationDays":7},
    {"id":"pro","name":"Pro","priceUsd":3.00,"boostPct":75,"durationDays":7},
    {"id":"max","name":"Max","priceUsd":3.50,"boostPct":100,"durationDays":7}
  ]'::jsonb,
  admin_key_hash text not null default '',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
insert into public.admin_settings (id) values ('default') on conflict (id) do nothing;
-- Helper: verify admin key (used by admin panel login)
CREATE OR REPLACE FUNCTION public.rpc_verify_admin_key(p_admin_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT encode(digest(p_admin_key, 'sha256'), 'hex') =
            (SELECT admin_key_hash FROM public.admin_settings WHERE id = 'default')),
    false
  );
$$;

-- Helper: return whether an admin key has been configured (avoids showing the
-- setup form when one already exists). Returns jsonb {configured: bool}.
CREATE OR REPLACE FUNCTION public.rpc_is_admin_configured()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'configured', (COALESCE((SELECT admin_key_hash FROM public.admin_settings WHERE id = 'default'), '') <> '')
  );
$$;

-- Bootstrap: set the admin key for the FIRST time (only works while no key is
-- configured, to avoid a chicken-and-egg problem). Once set, this no-ops.
CREATE OR REPLACE FUNCTION public.rpc_set_admin_key(p_admin_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current text;
BEGIN
  SELECT admin_key_hash INTO v_current FROM public.admin_settings WHERE id = 'default';
  IF COALESCE(v_current, '') <> '' THEN
    RAISE EXCEPTION 'Admin key is already configured. Use an authenticated admin session to change it.';
  END IF;
  IF p_admin_key IS NULL OR length(trim(p_admin_key)) < 8 THEN
    RAISE EXCEPTION 'Admin key must be at least 8 characters';
  END IF;
  UPDATE public.admin_settings
  SET admin_key_hash = encode(digest(p_admin_key, 'sha256'), 'hex'),
      updated_at = now()
  WHERE id = 'default';
  RETURN true;
END;
$$;

-- ----------------------------------------------------------
-- ADMIN USERS (Supabase Auth email + password login)
-- Link Supabase Auth users (auth.users) to admin access.
-- Promote an admin once from the SQL editor:
--   insert into public.admin_users (user_id, email)
--   select id, email from auth.users where email = 'you@gmail.com'
--   on conflict (user_id) do nothing;
-- ----------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.admin_users enable row level security;
-- No RLS policies on purpose: clients can never read or write this table.
-- SECURITY DEFINER functions below are the only way it is accessed.

-- Helper: is the CURRENTLY SIGNED-IN Supabase Auth user an admin?
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

-- Helper: log a key generation (for server-side cooldown enforcement)
CREATE OR REPLACE FUNCTION public.rpc_log_key_generation(p_wallet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.key_generation_log (wallet_id, created_at)
  VALUES (p_wallet_id, now())
  ON CONFLICT DO NOTHING;
END;
$$;



-- ----------------------------------------------------------
-- 3. BOOSTS
-- ----------------------------------------------------------
create table if not exists public.boosts (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  tier_id text not null,
  boost_pct numeric(6, 2) not null,
  starts_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_boosts_wallet on public.boosts(wallet_id);



-- ----------------------------------------------------------
-- 4. MINING SESSIONS (server-clock accrual, daily UTC quota)
-- ----------------------------------------------------------
create table if not exists public.mining_sessions (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  start_time timestamp with time zone default timezone('utc'::text, now()) not null,
  end_time timestamp with time zone not null,
  base_rate numeric(20, 4) not null,
  boost_pct numeric(6, 2) not null default 0,
  credited_hours numeric(8, 4) not null default 0.0000,
  reward_amount numeric(20, 4) not null default 0.0000,
  status text not null default 'mining' check (status in ('mining', 'completed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_mining_wallet on public.mining_sessions(wallet_id, start_time);

-- Add missing columns to existing tables (safe no-ops if already present)
alter table public.mining_sessions add column if not exists credited_hours numeric(8, 4) not null default 0.0000;
alter table public.mining_sessions add column if not exists reward_amount numeric(20, 4) not null default 0.0000;

-- ----------------------------------------------------------
-- 5b. KEY GENERATION LOG (server-side cooldown enforcement)
-- ----------------------------------------------------------
create table if not exists public.key_generation_log (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_keygen_wallet on public.key_generation_log(wallet_id, created_at);

-- Helper: check if user can generate a new key (server-side cooldown)
create or replace function public.rpc_can_generate_key(p_wallet_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select coalesce(
    (
      select (max(case when created_at > now() - interval '1 minute' then 1 else 0 end) = 1)
      from public.key_generation_log
      where wallet_id = p_wallet_id
    ), false)
$$;

-- ----------------------------------------------------------
-- 5. SWAP REQUESTS (anti-replay)
-- ----------------------------------------------------------
create table if not exists public.swap_requests (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  client_nonce text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ----------------------------------------------------------
-- 6. TRANSACTIONS
-- ----------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  tx_type text not null check (tx_type in ('send', 'receive', 'swap', 'mining', 'boost', 'task')),
  amount numeric(20, 4) not null,
  currency text not null check (currency in ('COOP', 'Cooptoken', 'Coopoints')),
  points_amount numeric(20, 4) not null default 0.0000,
  direction text,
  counterparty text,
  fee numeric(20, 4) default 0.0000,
  status text not null default 'Complete' check (status in ('Complete', 'Pending', 'Failed')),
  tx_hash text not null,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_tx_wallet on public.transactions(wallet_id, created_at);


-- ----------------------------------------------------------
-- 7. TASKS / USER TASKS / BOOST PURCHASES
-- ----------------------------------------------------------
create table if not exists public.tasks (
  id text primary key,
  title text not null,
  description text not null,
  category text not null default 'social' check (category in ('all', 'social', 'special')),
  reward_cooptoken numeric(20, 4) not null,
  action_url text,
  icon text not null default 'check'
);
insert into public.tasks (id, title, description, category, reward_cooptoken, action_url, icon)
values
  ('task_x', 'Follow on X', 'Join our official X account for updates', 'social', 10.0000, 'https://x.com/coopcoin', 'twitter'),
  ('task_tg', 'Join Telegram', 'Join our official community group', 'social', 15.0000, 'https://t.me/coopcoin', 'send'),
  ('task_daily', 'Daily Login', 'Check in daily and earn free mining power', 'special', 5.0000, '', 'calendar'),
  ('task_video', 'Watch Video', 'Watch a short introductory guide to COOP', 'special', 15.0000, 'https://youtube.com', 'video'),
  ('task_invite', 'Invite Friends', 'Earn rewards for every referral joining COOP', 'special', 50.0000, '', 'users')
on conflict (id) do nothing;

create table if not exists public.user_tasks (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  task_id text references public.tasks(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'claimed')),
  completed_at timestamp with time zone,
  claimed_at timestamp with time zone,
  unique(wallet_id, task_id)
);

create table if not exists public.boost_purchases (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  tier_name text not null,
  cost_usd numeric(10, 2) not null,
  bonus_reward numeric(20, 4) not null default 0,
  boost_pct integer not null default 0,
  status text not null default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ----------------------------------------------------------
-- 8. ROW LEVEL SECURITY — READ-ONLY for clients.
-- All writes go through security definer RPC functions only,
-- so clients can never modify balances from the browser.
-- ----------------------------------------------------------
alter table public.wallets enable row level security;
alter table public.admin_settings enable row level security;
alter table public.mining_sessions enable row level security;
alter table public.boosts enable row level security;
alter table public.boost_purchases enable row level security;
alter table public.tasks enable row level security;
alter table public.user_tasks enable row level security;
alter table public.transactions enable row level security;
alter table public.swap_requests enable row level security;
alter table public.key_generation_log enable row level security;

drop policy if exists "Allow all on wallets for demo" on public.wallets;
drop policy if exists "Allow all on mining_sessions" on public.mining_sessions;
drop policy if exists "Allow all on boost_purchases" on public.boost_purchases;
drop policy if exists "Allow all on user_tasks" on public.user_tasks;
drop policy if exists "Allow all on transactions" on public.transactions;
drop policy if exists "Allow all on key_generation_log" on public.key_generation_log;
drop policy if exists "Allow all on admin_settings" on public.admin_settings;
drop policy if exists "Read tasks" on public.tasks;
drop policy if exists "Read settings" on public.admin_settings;
drop policy if exists "Read mining" on public.mining_sessions;
drop policy if exists "Read boosts" on public.boosts;
drop policy if exists "Read user_tasks" on public.user_tasks;
drop policy if exists "Read transactions" on public.transactions;

-- NOTE: admin_settings has NO client policy on purpose. Exposing it would leak
-- the admin key hash to anyone with the anon key. All reads/writes go through
-- SECURITY DEFINER RPCs which bypass RLS.
create policy "Read tasks" on public.tasks for select using (true);
create policy "Read mining" on public.mining_sessions for select using (true);
create policy "Read boosts" on public.boosts for select using (true);
create policy "Read user_tasks" on public.user_tasks for select using (true);
create policy "Read transactions" on public.transactions for select using (true);
-- wallets, swap_requests, boost_purchases, key_generation_log, admin_settings: no client policies at all.


-- ==========================================================
-- RPC STORED PROCEDURES (server-side, atomic & validated)
-- ==========================================================

-- Helper: active boost percentage for a wallet (server-side)
create or replace function public._active_boost_pct(p_wallet_id uuid, p_stackable boolean)
returns numeric
language sql
stable
security definer
as $$
  select case when p_stackable
    then coalesce(sum(boost_pct), 0)
    else coalesce(max(boost_pct), 0)
  end
  from public.boosts
  where wallet_id = p_wallet_id and expires_at > now();
$$;

-- Helper: hours already mined in the current UTC daily cycle
create or replace function public._hours_mined_today(p_wallet_id uuid)
returns numeric
language sql
stable
security definer
as $$
  select coalesce(sum(
    case when status = 'completed'
      then credited_hours
      else greatest(0, extract(epoch from (least(now(), end_time) - start_time)) / 3600.0)
    end
  ), 0)
  from public.mining_sessions
  where wallet_id = p_wallet_id
    and (start_time at time zone 'utc')::date = (now() at time zone 'utc')::date;
$$;

-- Helper: Coopoints earned (credited) today
create or replace function public._points_earned_today(p_wallet_id uuid)
returns numeric
language sql
stable
security definer
as $$
  select coalesce(sum(reward_amount), 0)
  from public.mining_sessions
  where wallet_id = p_wallet_id
    and status = 'completed'
    and (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date;
$$;

-- A. Register or Login by Private Key (new accounts start at ZERO)
create or replace function public.rpc_authenticate_wallet(
  p_private_key text,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_key_hash text;
  v_wallet public.wallets%rowtype;
begin
  v_key_hash := encode(digest(p_private_key, 'sha256'), 'hex');

  select * into v_wallet from public.wallets where private_key_hash = v_key_hash limit 1;

  if found then
    update public.wallets set last_active_at = now() where id = v_wallet.id
    returning * into v_wallet;
    return to_jsonb(v_wallet);
  end if;

  insert into public.wallets (
    address, private_key_hash
  ) values (
    coalesce(p_address, '0x' || substring(v_key_hash from 1 for 40)),
    v_key_hash
  ) returning * into v_wallet;

  return to_jsonb(v_wallet);
end;
$$;


-- B. Mining status (single source of truth for the Mining screen)
create or replace function public.rpc_mining_status(p_wallet_id uuid)
returns jsonb
language plpgsql
stable
security definer
as $$
declare
  v_wallet public.wallets%rowtype;
  v_settings public.admin_settings%rowtype;
  v_session public.mining_sessions%rowtype;
  v_boost numeric;
  v_hours numeric;
  v_points numeric;
begin
  select * into v_wallet from public.wallets where id = p_wallet_id;
  if not found then
    raise exception 'Wallet not found';
  end if;

  select * into v_settings from public.admin_settings where id = 'default';
  v_boost := public._active_boost_pct(p_wallet_id, v_settings.boosts_stackable);
  v_hours := public._hours_mined_today(p_wallet_id);
  v_points := public._points_earned_today(p_wallet_id);

  select * into v_session from public.mining_sessions
  where wallet_id = p_wallet_id and status = 'mining'
  order by created_at desc limit 1;

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'session', case when v_session.id is null then null else to_jsonb(v_session) end,
    'rate', v_settings.base_mining_rate,
    'boost_pct', v_boost,
    'hours_mined_today', v_hours,
    'points_earned_today', v_points,
    'daily_hours', v_settings.daily_mining_hours,
    'daily_limit_points', v_settings.daily_mining_hours * v_settings.base_mining_rate,
    'next_reset_utc', date_trunc('day', now() at time zone 'utc') + interval '1 day',
    'mining_enabled', v_settings.mining_enabled
  );
end;
$$;

-- C. Start mining (server computes session end from remaining daily quota)
create or replace function public.rpc_start_mining(p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_settings public.admin_settings%rowtype;
  v_existing public.mining_sessions%rowtype;
  v_session public.mining_sessions%rowtype;
  v_boost numeric;
  v_hours numeric;
  v_remaining_hours numeric;
begin
  select * into v_settings from public.admin_settings where id = 'default';
  if not v_settings.mining_enabled then
    raise exception 'Mining is currently disabled';
  end if;

  select * into v_existing from public.mining_sessions
  where wallet_id = p_wallet_id and status = 'mining'
  order by created_at desc limit 1;

  if found then
    return to_jsonb(v_existing);
  end if;

  v_hours := public._hours_mined_today(p_wallet_id);
  v_remaining_hours := v_settings.daily_mining_hours - v_hours;
  if v_remaining_hours <= 0 then
    raise exception 'Daily mining limit reached. Mining resets at 00:00 UTC';
  end if;

  v_boost := public._active_boost_pct(p_wallet_id, v_settings.boosts_stackable);

  insert into public.mining_sessions (
    wallet_id, start_time, end_time, base_rate, boost_pct, status
  ) values (
    p_wallet_id,
    now(),
    now() + make_interval(hours => v_remaining_hours),
    v_settings.base_mining_rate,
    v_boost,
    'mining'
  ) returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

-- D. Stop mining & claim (reward computed entirely server-side)
create or replace function public.rpc_stop_mining(p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_wallet public.wallets%rowtype;
  v_session public.mining_sessions%rowtype;
  v_elapsed_hours numeric;
  v_reward numeric;
  v_tx_hash text;
begin
  select * into v_session from public.mining_sessions
  where wallet_id = p_wallet_id and status = 'mining'
  order by created_at desc limit 1
  for update;

  if not found then
    raise exception 'No active mining session';
  end if;

  -- Server clock is authoritative; client time is never used
  v_elapsed_hours := greatest(0,
    extract(epoch from (least(now(), v_session.end_time) - v_session.start_time)) / 3600.0);
  v_reward := round(v_elapsed_hours * v_session.base_rate * (1 + v_session.boost_pct / 100.0), 4);

  if v_reward <= 0 then
    raise exception 'Nothing to claim yet';
  end if;

  update public.mining_sessions
  set status = 'completed',
      credited_hours = round(v_elapsed_hours, 4),
      reward_amount = v_reward
  where id = v_session.id;

  update public.wallets
  set cooptoken_balance = cooptoken_balance + v_reward
  where id = p_wallet_id
  returning * into v_wallet;

  v_tx_hash := '0x' || md5(random()::text || clock_timestamp()::text);
  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id,
    'mining',
    v_reward,
    'Coopoints',
    'Mining Pool',
    0,
    'Complete',
    v_tx_hash,
    'Mining reward: ' || round(v_elapsed_hours, 2) || 'h at ' || v_session.base_rate::text ||
      ' Coopoints/hour (boost +' || v_session.boost_pct::text || '%)'
  );

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'session', (select to_jsonb(s) from public.mining_sessions s where s.id = v_session.id),
    'reward', v_reward,
    'tx_hash', v_tx_hash
  );
end;
$$;


-- E. Bidirectional swap (atomic, pool-checked, anti-replay, rate-limited)
create or replace function public.rpc_execute_swap(
  p_wallet_id uuid,
  p_direction text,
  p_amount numeric,
  p_client_nonce text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_wallet public.wallets%rowtype;
  v_settings public.admin_settings%rowtype;
  v_points_leg numeric(20, 4);
  v_coop_leg numeric(20, 4);
  v_points_today numeric(20, 4);
  v_tx_hash text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Swap amount must be greater than zero';
  end if;
  if p_client_nonce is null or length(p_client_nonce) < 8 then
    raise exception 'Invalid request';
  end if;
  if p_direction not in ('points_to_coop', 'coop_to_points') then
    raise exception 'Invalid swap direction';
  end if;

  select * into v_settings from public.admin_settings where id = 'default';
  if not v_settings.conversion_enabled then
    raise exception 'Conversion is currently disabled';
  end if;

  -- Anti-replay: each nonce can only ever be used once
  begin
    insert into public.swap_requests (wallet_id, client_nonce)
    values (p_wallet_id, p_client_nonce);
  exception when unique_violation then
    raise exception 'Duplicate or replayed request rejected';
  end;

  -- Rapid repeated conversion protection
  if exists (
    select 1 from public.transactions
    where wallet_id = p_wallet_id
      and tx_type = 'swap'
      and status = 'Complete'
      and created_at > now() - make_interval(secs => v_settings.swap_rate_limit_seconds)
  ) then
    raise exception 'Please wait a few seconds between conversions';
  end if;

  select * into v_wallet from public.wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'Wallet not found';
  end if;

  if p_direction = 'points_to_coop' then
    v_points_leg := round(p_amount, 4);
    v_coop_leg := round(v_points_leg / v_settings.points_per_coop, 4);

    if v_wallet.cooptoken_balance < v_points_leg then
      raise exception 'Insufficient Coopoints balance';
    end if;

    -- Per-user daily conversion limit
    select coalesce(sum(points_amount), 0) into v_points_today
    from public.transactions
    where wallet_id = p_wallet_id
      and tx_type = 'swap' and direction = 'points_to_coop' and status = 'Complete'
      and (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date;
    if v_points_today + v_points_leg > v_settings.daily_conversion_limit_points then
      raise exception using errcode = 'P0001',
        message = format('Daily conversion limit reached. You can convert up to %s Coopoints per day',
          v_settings.daily_conversion_limit_points::text);
    end if;

    -- Controlled emission pool check (points are NEVER touched on failure)
    if v_settings.remaining_coop_reward_pool < v_coop_leg then
      raise exception 'COOP conversion is temporarily unavailable. The current reward allocation has been reached. Your Coopoints remain safe in your account.';
    end if;

    -- Atomic: debit points, credit COOP, decrement pool — all or nothing
    update public.wallets
    set cooptoken_balance = cooptoken_balance - v_points_leg,
        coop_balance = coop_balance + v_coop_leg
    where id = p_wallet_id
      and cooptoken_balance >= v_points_leg
    returning * into v_wallet;
    if not found then
      raise exception 'Insufficient Coopoints balance';
    end if;

    update public.admin_settings
    set remaining_coop_reward_pool = remaining_coop_reward_pool - v_coop_leg
    where id = 'default';

    v_tx_hash := '0x' || md5(random()::text || clock_timestamp()::text);
    insert into public.transactions (
      wallet_id, tx_type, amount, currency, points_amount, direction,
      counterparty, fee, status, tx_hash, notes
    ) values (
      p_wallet_id, 'swap', v_coop_leg, 'COOP', v_points_leg, 'points_to_coop',
      'COOP Reward Pool', 0, 'Complete', v_tx_hash,
      'Converted ' || v_points_leg::text || ' Coopoints into ' || v_coop_leg::text || ' COOP'
    );

    return jsonb_build_object('wallet', to_jsonb(v_wallet), 'tx_hash', v_tx_hash,
      'points', v_points_leg, 'coop', v_coop_leg);
  end if;

  -- coop_to_points
  v_coop_leg := round(p_amount, 4);
  v_points_leg := round(v_coop_leg * v_settings.points_per_coop, 4);

  if v_wallet.coop_balance < v_coop_leg then
    raise exception 'Insufficient COOP balance';
  end if;

  -- Atomic: debit COOP, credit points, return COOP to the reward pool
  update public.wallets
  set coop_balance = coop_balance - v_coop_leg,
      cooptoken_balance = cooptoken_balance + v_points_leg
  where id = p_wallet_id
    and coop_balance >= v_coop_leg
  returning * into v_wallet;
  if not found then
    raise exception 'Insufficient COOP balance';
  end if;

  update public.admin_settings
  set remaining_coop_reward_pool = remaining_coop_reward_pool + v_coop_leg
  where id = 'default';

  v_tx_hash := '0x' || md5(random()::text || clock_timestamp()::text);
  insert into public.transactions (
    wallet_id, tx_type, amount, currency, points_amount, direction,
    counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id, 'swap', v_coop_leg, 'COOP', v_points_leg, 'coop_to_points',
    'COOP Reward Pool', 0, 'Complete', v_tx_hash,
    'Converted ' || v_coop_leg::text || ' COOP into ' || v_points_leg::text || ' Coopoints'
  );

  return jsonb_build_object('wallet', to_jsonb(v_wallet), 'tx_hash', v_tx_hash,
    'points', v_points_leg, 'coop', v_coop_leg);
end;
$$;


-- F. Public settings (rates, tiers, pool, feature flags)
create or replace function public.rpc_get_settings()
returns jsonb
language sql
stable
security definer
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

-- G. Admin update settings (requires a signed-in admin from Supabase Auth,
--    OR a valid admin key; verified server-side)
create or replace function public.rpc_admin_set_settings(
  p_admin_key text,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_is_auth_admin boolean;
  v_key_hash text;
begin
  -- Path 1: Supabase Auth session belonging to a promoted admin
  v_is_auth_admin := coalesce(
    exists (select 1 from public.admin_users where user_id = auth.uid()),
    false
  );
  if not v_is_auth_admin then
    -- Path 2: admin key fallback
    v_key_hash := coalesce((select admin_key_hash from public.admin_settings where id = 'default'), '');
    if v_key_hash = '' then
      raise exception 'Admin is not configured. Promote an admin user or set admin_key_hash first.';
    end if;
    if p_admin_key is null or encode(digest(p_admin_key, 'sha256'), 'hex') <> v_key_hash then
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
    update public.admin_settings set boost_tiers = p_updates->'boost_tiers' where id = 'default';
  end if;
  if p_updates ? 'admin_key_hash' then
    update public.admin_settings set admin_key_hash = p_updates->>'admin_key_hash' where id = 'default';
  end if;

  update public.admin_settings set updated_at = now() where id = 'default';
  return jsonb_build_object('ok', true);
end;
$$;


-- H. Send COOP (server-side, atomic, internal transfers credited)
create or replace function public.rpc_execute_send(
  p_wallet_id uuid,
  p_recipient text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_wallet public.wallets%rowtype;
  v_recipient_wallet public.wallets%rowtype;
  v_fee numeric(20, 4) := 0.0200;
  v_total_deduct numeric(20, 4);
  v_tx_hash text;
begin
  if p_amount <= 0 then
    raise exception 'Send amount must be greater than zero';
  end if;

  v_total_deduct := p_amount + v_fee;

  select * into v_wallet from public.wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'Sender wallet not found';
  end if;

  if v_wallet.coop_balance < v_total_deduct then
    raise exception 'Insufficient COOP balance (including 0.02 network fee)';
  end if;

  update public.wallets
  set coop_balance = coop_balance - v_total_deduct,
      total_sent = total_sent + p_amount
  where id = p_wallet_id
    and coop_balance >= v_total_deduct
  returning * into v_wallet;
  if not found then
    raise exception 'Insufficient COOP balance';
  end if;

  v_tx_hash := '0x' || md5(random()::text || clock_timestamp()::text);

  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id, 'send', p_amount, 'COOP', p_recipient, v_fee, 'Complete', v_tx_hash,
    'Sent ' || p_amount::text || ' COOP to ' || p_recipient
  );

  select * into v_recipient_wallet from public.wallets where address = p_recipient for update;
  if found then
    update public.wallets
    set coop_balance = coop_balance + p_amount,
        total_received = total_received + p_amount
    where id = v_recipient_wallet.id;

    insert into public.transactions (
      wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
    ) values (
      v_recipient_wallet.id, 'receive', p_amount, 'COOP', v_wallet.address, 0, 'Complete', v_tx_hash,
      'Received ' || p_amount::text || ' COOP from ' || v_wallet.address
    );
  end if;

  return jsonb_build_object('wallet', to_jsonb(v_wallet), 'tx_hash', v_tx_hash);
end;
$$;

-- I. Task completion & reward (server-side)
create or replace function public.rpc_claim_task_reward(
  p_wallet_id uuid,
  p_task_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_task public.tasks%rowtype;
  v_wallet public.wallets%rowtype;
  v_tx_hash text;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  if exists (
    select 1 from public.user_tasks
    where wallet_id = p_wallet_id and task_id = p_task_id and status = 'claimed'
  ) then
    raise exception 'Task already claimed';
  end if;

  insert into public.user_tasks (wallet_id, task_id, status, completed_at, claimed_at)
  values (p_wallet_id, p_task_id, 'claimed', now(), now())
  on conflict (wallet_id, task_id)
  do update set status = 'claimed', claimed_at = now();

  update public.wallets
  set cooptoken_balance = cooptoken_balance + v_task.reward_cooptoken
  where id = p_wallet_id
  returning * into v_wallet;

  v_tx_hash := '0x' || md5(random()::text || clock_timestamp()::text);

  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id, 'task', v_task.reward_cooptoken, 'Coopoints', v_task.title, 0, 'Complete', v_tx_hash,
    'Completed task: ' || v_task.title
  );

  return jsonb_build_object('wallet', to_jsonb(v_wallet), 'task_reward', v_task.reward_cooptoken);
end;
$$;

-- Grant execute on RPCs to the anon role (used by the web app)
grant execute on function public.rpc_authenticate_wallet(text, text) to anon, authenticated;
grant execute on function public.rpc_mining_status(uuid) to anon, authenticated;
grant execute on function public.rpc_start_mining(uuid) to anon, authenticated;
grant execute on function public.rpc_stop_mining(uuid) to anon, authenticated;
grant execute on function public.rpc_execute_swap(uuid, text, numeric, text) to anon, authenticated;
grant execute on function public.rpc_get_settings() to anon, authenticated;
grant execute on function public.rpc_admin_set_settings(text, jsonb) to anon, authenticated;
grant execute on function public.rpc_execute_send(uuid, text, numeric) to anon, authenticated;
grant execute on function public.rpc_claim_task_reward(uuid, text) to anon, authenticated;
grant execute on function public.rpc_verify_admin_key(text) to anon, authenticated;
grant execute on function public.rpc_set_admin_key(text) to anon, authenticated;
grant execute on function public.rpc_can_generate_key(uuid) to anon, authenticated;
grant execute on function public.rpc_log_key_generation(uuid) to anon, authenticated;
grant execute on function public.rpc_is_admin_configured() to anon, authenticated;
grant execute on function public.rpc_is_admin() to anon, authenticated;

