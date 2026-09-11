-- ==========================================================
-- COOP ADMIN DASHBOARD SQL (v2)
-- Fixes the live database + installs all admin RPCs.
--
-- PART A is a REPAIR MIGRATION: the live DB is missing columns that the
-- MAIN WEBAPP'S OWN CODE already uses (rpc_start_mining currently fails
-- with 'column "base_rate" does not exist'; swaps write points_amount).
-- This aligns the DB with supabase/schema.sql used by the main webapp.
-- Everything is idempotent (safe to re-run).
--
-- PART B installs the admin RPCs. All are SECURITY DEFINER and enforce
-- admin authorization internally (admin_users member OR admin key hash).
-- ==========================================================

-- ============ PART A: LIVE-DB REPAIR MIGRATION =============
create extension if not exists pgcrypto;

-- A1. Columns the main webapp's own RPCs already write/read:
alter table public.mining_sessions
  add column if not exists base_rate numeric(20, 4) not null default 50.0000,
  add column if not exists boost_pct numeric(6, 2) not null default 0;

alter table public.transactions
  add column if not exists points_amount numeric(20, 4) not null default 0.0000,
  add column if not exists direction text;

-- A2. Admin capability: enable/disable tasks (wallet hides disabled ones)
alter table public.tasks
  add column if not exists enabled boolean not null default true;

-- A3. boost_purchases admin/payment columns (repo schema has them; older live DB may not)
alter table public.boost_purchases
  add column if not exists status text not null default 'pending',
  add column if not exists boost_pct integer not null default 0;

-- A4. Allow 'admin' transaction type for audited manual balance adjustments.
--     Drop whichever tx_type check constraint exists, then re-add with 'admin'.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%tx_type%'
  loop
    execute format('alter table public.transactions drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.transactions
  add constraint transactions_tx_type_check
  check (tx_type in ('send', 'receive', 'swap', 'mining', 'boost', 'task', 'admin'))
  not valid;

-- A5. Immutable audit log for every admin balance adjustment.
--     RLS enabled, no policies: reachable ONLY through the admin RPCs.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text,
  wallet_id uuid references public.wallets(id) on delete set null,
  action text not null,
  currency text not null,
  delta numeric(20, 4) not null,
  reason text not null,
  tx_ref text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.admin_audit_log enable row level security;

-- A6. Economy alignment (mandated by the project):
--     - EXACT ratio: 1,000 Cooptoken = 1 COOP
--     - Mining: 50 Cooptoken per 12 hours
--     - Boost packages (optional speed boosts, exact pricing):
--         Starter  $1.00 USDT   +25%   7 days
--         Plus     $2.50 USDT   +50%   7 days
--         Pro      $4.00 USDT   +75%   7 days
--         Max      $5.50 USDT   +100%  7 days
--       All four stay "Coming Soon" in the wallet until an admin turns on
--       purchases (Settings -> Boost purchases enabled).
--     NOTE: re-running this file resets these values to the defaults above.
update public.admin_settings set
  points_per_coop = 1000.0000,
  base_mining_rate = 50.0000,
  daily_mining_hours = 12.00,
  boost_purchases_enabled = false,
  boost_tiers = '[
    {"id":"starter","name":"Starter","priceUsd":1.00,"boostPct":25,"durationDays":7},
    {"id":"plus","name":"Plus","priceUsd":2.50,"boostPct":50,"durationDays":7},
    {"id":"pro","name":"Pro","priceUsd":4.00,"boostPct":75,"durationDays":7},
    {"id":"max","name":"Max","priceUsd":5.50,"boostPct":100,"durationDays":7}
  ]'::jsonb
where id = 'default';

-- ============ PART B: ADMIN RPCs ============
-- ---------- auth helper ----------
create or replace function public.rpc_admin_authorized(p_admin_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    exists (select 1 from public.admin_users where user_id = auth.uid()),
    false
  ) or coalesce(
    p_admin_key is not null and p_admin_key <> ''
    and encode(digest(p_admin_key, 'sha256'), 'hex')
      = (select admin_key_hash from public.admin_settings where id = 'default'),
    false
  );
$$;

-- Helper: identify the acting admin for the audit log
create or replace function public.rpc_admin_identity()
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (select email from public.admin_users where user_id = auth.uid() limit 1),
    case when auth.uid() is null then 'admin-key' else 'unknown-admin' end
  );
$$;
-- ---------- OVERVIEW ----------
create or replace function public.rpc_admin_overview(p_admin_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_ok boolean;
  v_total_users bigint; v_new_24h bigint; v_active_7d bigint;
  v_mining_active bigint; v_ready_claim bigint;
  v_mined_total numeric; v_claims bigint;
  v_swap_count bigint; v_swapped_points numeric; v_coop_from_swaps numeric;
  v_ppc numeric;
  v_task_claims bigint; v_task_rewards numeric;
  v_send_count bigint; v_sent_total numeric;
  v_admin_adj_count bigint; v_admin_adj_total numeric;
  v_pool_total numeric; v_pool_left numeric;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;

  select count(*) into v_total_users from public.wallets;
  select count(*) into v_new_24h from public.wallets where created_at >= now() - interval '24 hours';
  select count(*) into v_active_7d from public.wallets where last_active_at >= now() - interval '7 days';

  select count(*) into v_mining_active from public.mining_sessions where status = 'mining';
  select count(*) into v_ready_claim from public.mining_sessions where status = 'mining' and end_time <= now();

  -- Cooptoken mined: the wallet writes mining claims with currency 'Coopoints'
  select coalesce(sum(amount), 0), count(*) into v_mined_total, v_claims
  from public.transactions where tx_type = 'mining' and status = 'Complete';

  select points_per_coop into v_ppc from public.admin_settings where id = 'default';

  -- Swaps: one row per swap, amount = COOP leg, points_amount = Cooptoken leg.
  -- Defensive: if points_amount was never populated (legacy rows), derive from ratio.
  select count(*), coalesce(sum(amount), 0) into v_swap_count, v_coop_from_swaps
  from public.transactions
  where tx_type = 'swap' and status = 'Complete' and upper(currency) = 'COOP'
    and (direction is null or direction = 'points_to_coop');
  select coalesce(sum(points_amount), 0) into v_swapped_points
  from public.transactions
  where tx_type = 'swap' and status = 'Complete' and upper(currency) = 'COOP'
    and (direction is null or direction = 'points_to_coop');
  if coalesce(v_swapped_points, 0) = 0 and coalesce(v_coop_from_swaps, 0) > 0 then
    v_swapped_points := v_coop_from_swaps * v_ppc;
  end if;

  select count(*), coalesce(sum(amount), 0) into v_task_claims, v_task_rewards
  from public.transactions where tx_type = 'task' and status = 'Complete';

  select count(*), coalesce(sum(amount), 0) into v_send_count, v_sent_total
  from public.transactions where tx_type = 'send' and status = 'Complete';

  select count(*), coalesce(sum(abs(delta)), 0) into v_admin_adj_count, v_admin_adj_total
  from public.admin_audit_log where action = 'balance_adjust';

  select total_coop_reward_pool, remaining_coop_reward_pool
    into v_pool_total, v_pool_left
  from public.admin_settings where id = 'default';

  return jsonb_build_object(
    'total_users', coalesce(v_total_users, 0),
    'new_users_24h', coalesce(v_new_24h, 0),
    'active_users_7d', coalesce(v_active_7d, 0),
    'mining_active', coalesce(v_mining_active, 0),
    'ready_to_claim', coalesce(v_ready_claim, 0),
    'mined_total_cooptoken', coalesce(v_mined_total, 0),
    'mining_claims', coalesce(v_claims, 0),
    'swap_count', coalesce(v_swap_count, 0),
    'swapped_points', coalesce(v_swapped_points, 0),
    'coop_from_swaps', coalesce(v_coop_from_swaps, 0),
    'task_claims', coalesce(v_task_claims, 0),
    'task_rewards', coalesce(v_task_rewards, 0),
    'send_count', coalesce(v_send_count, 0),
    'sent_total_coop', coalesce(v_sent_total, 0),
    'admin_adjustments', coalesce(v_admin_adj_count, 0),
    'admin_adjusted_total', coalesce(v_admin_adj_total, 0),
    'pool_total', coalesce(v_pool_total, 0),
    'pool_left', coalesce(v_pool_left, 0),
    'points_per_coop', coalesce(v_ppc, 1000)
  );
end;
$$;

-- ---------- TIMESERIES (last N UTC days) ----------
create or replace function public.rpc_admin_timeseries(
  p_admin_key text default null,
  p_days integer default 14
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_ok boolean; v_days integer;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  v_days := greatest(7, least(90, coalesce(p_days, 14)));
  return (
    with days as (
      select (date_trunc('day', now() at time zone 'utc') - (s || ' days')::interval)::date as d
      from generate_series(0, v_days - 1) s
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', d::text,
      'new_users', (select count(*) from public.wallets w where (w.created_at at time zone 'utc')::date = days.d),
      'mining_claims', (select count(*) from public.transactions t where t.tx_type='mining' and (t.created_at at time zone 'utc')::date = days.d),
      'mined_cooptoken', (select coalesce(sum(t.amount),0) from public.transactions t where t.tx_type='mining' and (t.created_at at time zone 'utc')::date = days.d),
      'swaps', (select count(*) from public.transactions t where t.tx_type='swap' and (t.created_at at time zone 'utc')::date = days.d),
      'task_claims', (select count(*) from public.transactions t where t.tx_type='task' and (t.created_at at time zone 'utc')::date = days.d),
      'admin_adjustments', (select count(*) from public.admin_audit_log a where (a.created_at at time zone 'utc')::date = days.d)
    ) order by d), '[]'::jsonb)
    from days
  );
end;
$$;
-- ---------- WALLETS / USERS (paginated, searchable, NO secrets) ----------
create or replace function public.rpc_admin_wallets(
  p_admin_key text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_order text default 'recent'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_ok boolean; v_lim integer; v_off integer; v_total bigint;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  v_lim := greatest(1, least(200, coalesce(p_limit, 50)));
  v_off := greatest(0, coalesce(p_offset, 0));

  select count(*) into v_total from public.wallets w
  where p_search is null or p_search = ''
     or w.address ilike '%' || p_search || '%'
     or w.id::text ilike '%' || p_search || '%';

  return jsonb_build_object(
    'total', v_total,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'address', w.address,
        'coop_balance', w.coop_balance, 'cooptoken_balance', w.cooptoken_balance,
        'total_sent', w.total_sent, 'total_received', w.total_received,
        'created_at', w.created_at, 'last_active_at', w.last_active_at,
        'mining_state', (select ms.status from public.mining_sessions ms
           where ms.wallet_id = w.id order by ms.created_at desc limit 1),
        'tx_count', (select count(*) from public.transactions t where t.wallet_id = w.id)
      ) order by
        case when p_order = 'balance' then w.cooptoken_balance end desc nulls last,
        case when p_order <> 'balance' then w.created_at end desc nulls last
      )
      from (
        select w.* from public.wallets w
        where p_search is null or p_search = ''
           or w.address ilike '%' || p_search || '%'
           or w.id::text ilike '%' || p_search || '%'
        order by case when p_order = 'balance' then w.cooptoken_balance end desc nulls last,
                 w.created_at desc
        limit v_lim offset v_off
      ) w
    ), '[]'::jsonb)
  );
end;
$$;
-- ---------- SINGLE WALLET DETAIL (no secrets) + activity ----------
create or replace function public.rpc_admin_wallet_detail(
  p_admin_key text default null,
  p_wallet_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_ok boolean; v_w public.wallets%rowtype; v_ms public.mining_sessions%rowtype;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  if p_wallet_id is null then raise exception 'Wallet id required'; end if;

  select * into v_w from public.wallets where id = p_wallet_id;
  if not found then raise exception 'Wallet not found'; end if;

  select * into v_ms from public.mining_sessions
  where wallet_id = p_wallet_id order by created_at desc limit 1;

  return jsonb_build_object(
    'wallet', jsonb_build_object(
      'id', v_w.id, 'address', v_w.address,
      'coop_balance', v_w.coop_balance, 'cooptoken_balance', v_w.cooptoken_balance,
      'total_sent', v_w.total_sent, 'total_received', v_w.total_received,
      'created_at', v_w.created_at, 'last_active_at', v_w.last_active_at
    ),
    'mining', case when v_ms.id is null then null else jsonb_build_object(
      'status', v_ms.status, 'start_time', v_ms.start_time, 'end_time', v_ms.end_time,
      'base_rate', v_ms.base_rate, 'boost_pct', v_ms.boost_pct,
      'credited_hours', v_ms.credited_hours, 'reward_amount', v_ms.reward_amount
    ) end,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', s.status, 'start_time', s.start_time, 'end_time', s.end_time,
        'base_rate', s.base_rate, 'boost_pct', s.boost_pct,
        'credited_hours', s.credited_hours, 'reward_amount', s.reward_amount
      ) order by s.start_time desc)
      from (select * from public.mining_sessions where wallet_id = p_wallet_id order by start_time desc limit 10) s
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'tx_type', t.tx_type, 'amount', t.amount, 'currency', t.currency,
        'points_amount', t.points_amount, 'direction', t.direction,
        'counterparty', t.counterparty, 'fee', t.fee, 'status', t.status,
        'tx_hash', t.tx_hash, 'notes', t.notes, 'created_at', t.created_at
      ) order by t.created_at desc)
      from (select * from public.transactions where wallet_id = p_wallet_id order by created_at desc limit 50) t
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task_id', ut.task_id, 'title', tk.title, 'status', ut.status,
        'reward', tk.reward_cooptoken, 'claimed_at', ut.claimed_at
      ))
      from public.user_tasks ut left join public.tasks tk on tk.id = ut.task_id
      where ut.wallet_id = p_wallet_id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'admin_email', a.admin_email, 'action', a.action,
        'currency', a.currency, 'delta', a.delta, 'reason', a.reason,
        'tx_ref', a.tx_ref, 'created_at', a.created_at
      ) order by a.created_at desc)
      from (select * from public.admin_audit_log where wallet_id = p_wallet_id order by created_at desc limit 20) a
    ), '[]'::jsonb)
  );
end;
$$;
-- ---------- TRANSACTIONS (global feed, filterable) ----------
create or replace function public.rpc_admin_transactions(
  p_admin_key text default null, p_type text default 'all',
  p_search text default null, p_limit integer default 50, p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_lim integer; v_off integer; v_total bigint;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  v_lim := greatest(1, least(200, coalesce(p_limit, 50)));
  v_off := greatest(0, coalesce(p_offset, 0));
  select count(*) into v_total from public.transactions t
  where (p_type is null or p_type='all' or t.tx_type=p_type)
    and (p_search is null or p_search='' or t.tx_hash ilike '%'||p_search||'%'
      or t.counterparty ilike '%'||p_search||'%' or t.wallet_id::text ilike '%'||p_search||'%');
  return jsonb_build_object('total', v_total, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'wallet_id', t.wallet_id, 'address', w.address,
      'tx_type', t.tx_type, 'amount', t.amount, 'currency', t.currency,
      'points_amount', t.points_amount, 'direction', t.direction,
      'counterparty', t.counterparty, 'fee', t.fee, 'status', t.status,
      'tx_hash', t.tx_hash, 'notes', t.notes, 'created_at', t.created_at
    ) order by t.created_at desc)
    from (
      select t.* from public.transactions t
      where (p_type is null or p_type='all' or t.tx_type=p_type)
        and (p_search is null or p_search='' or t.tx_hash ilike '%'||p_search||'%'
          or t.counterparty ilike '%'||p_search||'%' or t.wallet_id::text ilike '%'||p_search||'%')
      order by t.created_at desc limit v_lim offset v_off
    ) t left join public.wallets w on w.id=t.wallet_id
  ), '[]'::jsonb));
end;
$$;

-- ---------- SWAPS ----------
create or replace function public.rpc_admin_swaps(
  p_admin_key text default null, p_limit integer default 50, p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_lim integer; v_off integer; v_total bigint;
  v_count bigint; v_pts numeric; v_coop numeric; v_ppc numeric;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  v_lim := greatest(1, least(200, coalesce(p_limit, 50)));
  v_off := greatest(0, coalesce(p_offset, 0));
  select points_per_coop into v_ppc from public.admin_settings where id='default';
  select count(*), coalesce(sum(amount),0) into v_count, v_coop
    from public.transactions
   where tx_type='swap' and status='Complete' and upper(currency)='COOP'
     and (direction is null or direction='points_to_coop');
  select coalesce(sum(points_amount),0) into v_pts
    from public.transactions
   where tx_type='swap' and status='Complete' and upper(currency)='COOP'
     and (direction is null or direction='points_to_coop');
  if coalesce(v_pts,0) = 0 and coalesce(v_coop,0) > 0 then
    v_pts := v_coop * v_ppc;
  end if;
  select count(*) into v_total from public.transactions where tx_type='swap';
  return jsonb_build_object(
    'totals', jsonb_build_object('count', coalesce(v_count,0), 'points', coalesce(v_pts,0), 'coop', coalesce(v_coop,0)),
    'points_per_coop', coalesce(v_ppc, 1000),
    'total', v_total, 'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'wallet_id', t.wallet_id, 'address', w.address,
        'points_amount', t.points_amount, 'amount', t.amount,
        'direction', t.direction, 'status', t.status, 'tx_hash', t.tx_hash, 'created_at', t.created_at
      ) order by t.created_at desc)
      from (select * from public.transactions where tx_type='swap'
            order by created_at desc limit v_lim offset v_off) t
      left join public.wallets w on w.id=t.wallet_id
    ), '[]'::jsonb));
end;
$$;
-- ---------- MINING ----------
create or replace function public.rpc_admin_mining(
  p_admin_key text default null, p_state text default 'all',
  p_limit integer default 50, p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_lim integer; v_off integer;
  v_active bigint; v_ready bigint; v_claims bigint; v_mined numeric;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  v_lim := greatest(1, least(200, coalesce(p_limit, 50)));
  v_off := greatest(0, coalesce(p_offset, 0));
  select count(*) into v_active from public.mining_sessions where status='mining';
  select count(*) into v_ready from public.mining_sessions
   where status='mining' and end_time <= now();
  select count(*) into v_claims from public.mining_sessions where status='completed';
  select coalesce(sum(reward_amount),0) into v_mined from public.mining_sessions
   where status='completed';
  return jsonb_build_object(
    'stats', jsonb_build_object('active', coalesce(v_active,0), 'ready', coalesce(v_ready,0),
      'claims', coalesce(v_claims,0), 'mined', coalesce(v_mined,0)),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'wallet_id', s.wallet_id, 'address', w.address,
        'status', s.status, 'start_time', s.start_time, 'end_time', s.end_time,
        'base_rate', s.base_rate, 'boost_pct', s.boost_pct,
        'credited_hours', s.credited_hours, 'reward_amount', s.reward_amount
      ) order by s.start_time desc)
      from (select * from public.mining_sessions
        where p_state is null or p_state='all'
           or (p_state='active' and status='mining')
           or (p_state='ready' and status='mining' and end_time <= now())
           or (p_state='completed' and status='completed')
        order by start_time desc limit v_lim offset v_off
      ) s left join public.wallets w on w.id=s.wallet_id
    ), '[]'::jsonb));
end;
$$;
-- ---------- TASKS (catalog with claims/distributed + enabled flag) ----------
create or replace function public.rpc_admin_tasks(p_admin_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare v_ok boolean;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  return jsonb_build_object('rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'title', t.title, 'description', t.description,
      'category', t.category, 'reward_cooptoken', t.reward_cooptoken,
      'action_url', t.action_url, 'icon', t.icon, 'enabled', t.enabled,
      'claims', (select count(*) from public.user_tasks ut
                 where ut.task_id = t.id and ut.status = 'claimed'),
      'distributed', (select coalesce(count(*), 0) * t.reward_cooptoken
                      from public.user_tasks ut
                      where ut.task_id = t.id and ut.status = 'claimed')
    ) order by t.id) from public.tasks t
  ), '[]'::jsonb));
end;
$$;

-- ---------- TASKS (create/update; writes the table the wallet reads) ----------
create or replace function public.rpc_admin_upsert_task(
  p_admin_key text default null, p_id text default null, p_title text default null,
  p_description text default '', p_category text default 'social',
  p_reward numeric default 0, p_action_url text default '', p_icon text default 'check',
  p_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_ok boolean;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  if p_id is null or p_id='' then raise exception 'Task id required'; end if;
  if p_title is null or p_title='' then raise exception 'Task title required'; end if;
  if p_category not in ('all','social','special') then raise exception 'Invalid category'; end if;
  insert into public.tasks (id, title, description, category, reward_cooptoken, action_url, icon, enabled)
  values (p_id, p_title, coalesce(p_description,''), p_category, coalesce(p_reward,0),
          nullif(coalesce(p_action_url,''),''), coalesce(nullif(p_icon,''),'check'), coalesce(p_enabled,true))
  on conflict (id) do update set title=excluded.title, description=excluded.description,
    category=excluded.category, reward_cooptoken=excluded.reward_cooptoken,
    action_url=excluded.action_url, icon=excluded.icon, enabled=excluded.enabled;
  return jsonb_build_object('success', true, 'id', p_id);
end;
$$;

create or replace function public.rpc_admin_delete_task(
  p_admin_key text default null, p_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_ok boolean;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  if p_id is null then raise exception 'Task id required'; end if;
  delete from public.tasks where id = p_id;
  return jsonb_build_object('success', true);
end;
$$;
-- ---------- USER BOOST PURCHASE (gated by admin switch) ----------
-- The wallet's Buy button works ONLY while an admin has turned on
-- boost_purchases_enabled (Settings page). Records the purchase and grants
-- the boost into public.boosts, which _active_boost_pct() already uses.
create or replace function public.rpc_purchase_boost(
  p_wallet_id uuid,
  p_tier_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_settings public.admin_settings%rowtype;
  v_tier jsonb;
  v_pct numeric;
  v_price numeric;
  v_days integer;
  v_expires timestamptz;
  v_wallet public.wallets%rowtype;
begin
  select * into v_settings from public.admin_settings where id = 'default';
  if not v_settings.boost_purchases_enabled then
    raise exception 'Boost purchases are coming soon. Payments are not enabled yet.';
  end if;

  select * into v_wallet from public.wallets where id = p_wallet_id;
  if not found then raise exception 'Wallet not found'; end if;

  select t into v_tier
  from jsonb_array_elements(v_settings.boost_tiers) t
  where t->>'id' = p_tier_id;
  if v_tier is null then raise exception 'Unknown boost tier'; end if;

  v_pct := coalesce((v_tier->>'boostPct')::numeric, (v_tier->>'boost_pct')::numeric, 0);
  v_price := coalesce((v_tier->>'priceUsd')::numeric, (v_tier->>'price_usd')::numeric, 0);
  v_days := coalesce((v_tier->>'durationDays')::integer, (v_tier->>'duration_days')::integer, 7);
  if v_days < 1 then v_days := 7; end if;
  v_expires := now() + make_interval(days => v_days);

  insert into public.boost_purchases (wallet_id, tier_name, cost_usd, bonus_reward, boost_pct, status)
  values (p_wallet_id, coalesce(v_tier->>'name', p_tier_id), v_price, 0, v_pct, 'Complete');

  insert into public.boosts (wallet_id, tier_id, boost_pct, starts_at, expires_at)
  values (p_wallet_id, p_tier_id, v_pct, now(), v_expires);

  return jsonb_build_object(
    'success', true,
    'tier', coalesce(v_tier->>'name', p_tier_id),
    'boost_pct', v_pct,
    'expires_at', v_expires
  );
end;
$$;
-- ---------- BOOSTS (config in admin_settings.boost_tiers + real grants/purchases) ----------
create or replace function public.rpc_admin_boosts(p_admin_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_tiers jsonb; v_enabled boolean; v_stack boolean;
  v_active bigint; v_expired bigint;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  select boost_tiers, boost_purchases_enabled, boosts_stackable
    into v_tiers, v_enabled, v_stack from public.admin_settings where id='default';
  select count(*) into v_active from public.boosts where expires_at > now();
  select count(*) into v_expired from public.boosts where expires_at <= now();
  return jsonb_build_object(
    'tiers', coalesce(v_tiers, '[]'::jsonb),
    'purchases_enabled', coalesce(v_enabled, false),
    'stackable', coalesce(v_stack, false),
    'grants_stats', jsonb_build_object('active', coalesce(v_active,0), 'expired', coalesce(v_expired,0)),
    'grants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'wallet_id', b.wallet_id, 'address', w.address,
        'tier_id', b.tier_id, 'boost_pct', b.boost_pct,
        'starts_at', b.starts_at, 'expires_at', b.expires_at
      ) order by b.expires_at desc)
      from (select * from public.boosts order by expires_at desc limit 100) b
      left join public.wallets w on w.id=b.wallet_id
    ), '[]'::jsonb),
    'purchases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'wallet_id', b.wallet_id, 'address', w.address,
        'tier_name', b.tier_name, 'cost_usd', b.cost_usd,
        'bonus_reward', b.bonus_reward, 'boost_pct', b.boost_pct,
        'status', b.status, 'created_at', b.created_at
      ) order by b.created_at desc)
      from (select * from public.boost_purchases order by created_at desc limit 100) b
      left join public.wallets w on w.id=b.wallet_id
    ), '[]'::jsonb));
end;
$$;
-- ---------- AUDITED BALANCE ADJUSTMENT (never silent) ----------
-- Adjusts a wallet's COOP or Cooptoken balance and records BOTH:
--   1. an 'admin' transaction row (visible in the user's wallet history)
--   2. a row in admin_audit_log (admin, amount, reason, timestamp, tx ref)
create or replace function public.rpc_admin_adjust_balance(
  p_admin_key text default null,
  p_wallet_id uuid default null,
  p_currency text default 'COOP',
  p_delta numeric default 0,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ok boolean;
  v_cur text; v_delta numeric; v_reason text;
  v_wallet public.wallets%rowtype;
  v_tx_hash text; v_audit_id uuid; v_admin text;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  if p_wallet_id is null then raise exception 'Wallet id required'; end if;

  v_cur := initcap(coalesce(p_currency, ''));
  if v_cur not in ('Coop', 'Cooptoken') then
    raise exception 'Currency must be COOP or Cooptoken';
  end if;
  if v_cur = 'Coop' then v_cur := 'COOP'; end if;

  v_delta := p_delta;
  if v_delta is null or v_delta = 0 then
    raise exception 'Adjustment amount must be a non-zero number (use a negative value to decrease)';
  end if;

  v_reason := coalesce(p_reason, '');
  if length(trim(v_reason)) < 3 then
    raise exception 'A reason is required for every balance adjustment';
  end if;

  select * into v_wallet from public.wallets where id = p_wallet_id for update;
  if not found then raise exception 'Wallet not found'; end if;

  if v_cur = 'COOP' then
    update public.wallets
    set coop_balance = coop_balance + v_delta
    where id = p_wallet_id and coop_balance + v_delta >= 0
    returning * into v_wallet;
  else
    update public.wallets
    set cooptoken_balance = cooptoken_balance + v_delta
    where id = p_wallet_id and cooptoken_balance + v_delta >= 0
    returning * into v_wallet;
  end if;
  if not found then
    raise exception 'Adjustment rejected: result would make the balance negative';
  end if;

  v_tx_hash := 'admin-' || md5(clock_timestamp()::text || p_wallet_id::text || v_delta::text || random()::text);

  insert into public.transactions (
    wallet_id, tx_type, amount, currency, points_amount, direction,
    counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id, 'admin', abs(v_delta), v_cur,
    case when v_cur = 'Cooptoken' then abs(v_delta) else 0 end,
    case when v_delta > 0 then 'credit' else 'debit' end,
    'Admin adjustment', 0, 'Complete', v_tx_hash,
    'Admin balance adjustment (' || case when v_delta > 0 then '+' else '' end
      || v_delta::text || ' ' || v_cur || '): ' || v_reason
  );

  v_admin := public.rpc_admin_identity();
  insert into public.admin_audit_log (admin_email, wallet_id, action, currency, delta, reason, tx_ref)
  values (v_admin, p_wallet_id, 'balance_adjust', v_cur, v_delta, v_reason, v_tx_hash)
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'tx_ref', v_tx_hash,
    'audit_id', v_audit_id,
    'admin', v_admin,
    'wallet', jsonb_build_object(
      'id', v_wallet.id, 'address', v_wallet.address,
      'coop_balance', v_wallet.coop_balance, 'cooptoken_balance', v_wallet.cooptoken_balance
    )
  );
end;
$$;
-- ---------- AUDIT LOG (global list, filterable by wallet) ----------
create or replace function public.rpc_admin_audit(
  p_admin_key text default null,
  p_wallet_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_lim integer; v_off integer; v_total bigint;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  v_lim := greatest(1, least(200, coalesce(p_limit, 50)));
  v_off := greatest(0, coalesce(p_offset, 0));
  select count(*) into v_total from public.admin_audit_log
  where p_wallet_id is null or wallet_id = p_wallet_id;
  return jsonb_build_object('total', v_total, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'admin_email', a.admin_email, 'wallet_id', a.wallet_id,
      'address', w.address, 'action', a.action, 'currency', a.currency,
      'delta', a.delta, 'reason', a.reason, 'tx_ref', a.tx_ref, 'created_at', a.created_at
    ) order by a.created_at desc)
    from (
      select * from public.admin_audit_log
      where p_wallet_id is null or wallet_id = p_wallet_id
      order by created_at desc limit v_lim offset v_off
    ) a left join public.wallets w on w.id = a.wallet_id
  ), '[]'::jsonb));
end;
$$;

-- ---------- RECENT ACTIVITY (Overview feed) ----------
create or replace function public.rpc_admin_recent(p_admin_key text default null, p_limit integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_lim integer;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  v_lim := greatest(1, least(50, coalesce(p_limit, 12)));
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'wallet_id', t.wallet_id, 'address', w.address,
      'tx_type', t.tx_type, 'amount', t.amount, 'currency', t.currency,
      'points_amount', t.points_amount, 'status', t.status, 'created_at', t.created_at
    ) order by t.created_at desc)
    from (select * from public.transactions order by created_at desc limit v_lim) t
    left join public.wallets w on w.id=t.wallet_id
  ), '[]'::jsonb);
end;
$$;

-- ---------- grants (auth is enforced inside each function) ----------
grant execute on function public.rpc_admin_authorized(text) to anon, authenticated;
grant execute on function public.rpc_admin_identity() to anon, authenticated;
grant execute on function public.rpc_admin_overview(text) to anon, authenticated;
grant execute on function public.rpc_admin_timeseries(text, integer) to anon, authenticated;
grant execute on function public.rpc_admin_wallets(text, text, integer, integer, text) to anon, authenticated;
grant execute on function public.rpc_admin_wallet_detail(text, uuid) to anon, authenticated;
grant execute on function public.rpc_admin_transactions(text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.rpc_admin_swaps(text, integer, integer) to anon, authenticated;
grant execute on function public.rpc_admin_mining(text, text, integer, integer) to anon, authenticated;
grant execute on function public.rpc_admin_tasks(text) to anon, authenticated;
grant execute on function public.rpc_admin_upsert_task(text, text, text, text, text, numeric, text, text, boolean) to anon, authenticated;
grant execute on function public.rpc_admin_delete_task(text, text) to anon, authenticated;
grant execute on function public.rpc_purchase_boost(uuid, text) to anon, authenticated;
grant execute on function public.rpc_admin_boosts(text) to anon, authenticated;
grant execute on function public.rpc_admin_adjust_balance(text, uuid, text, numeric, text) to anon, authenticated;
grant execute on function public.rpc_admin_audit(text, uuid, integer, integer) to anon, authenticated;
grant execute on function public.rpc_admin_recent(text, integer) to anon, authenticated;
