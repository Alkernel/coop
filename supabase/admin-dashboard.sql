-- ==========================================================
-- COOP ADMIN DASHBOARD RPCs (v1)
-- Run AFTER supabase/schema.sql + supabase/admin-setup.sql
-- Safe to re-run. All functions are SECURITY DEFINER and enforce
-- admin authorization internally: signed-in admin_users member
-- OR a valid admin key hash. Never exposes private_key_hash.
-- Backed all by the SAME tables the wallet uses (single source of truth).
-- ==========================================================
create extension if not exists pgcrypto;

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
  v_mined_total numeric; v_claimed_total numeric;
  v_swap_count bigint; v_swapped_points numeric; v_coop_from_swaps numeric;
  v_task_claims bigint; v_task_rewards numeric;
  v_send_count bigint; v_sent_total numeric;
  v_pool_total numeric; v_pool_left numeric; v_ppc numeric;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;

  select count(*) into v_total_users from public.wallets;
  select count(*) into v_new_24h
  from public.wallets where created_at >= now() - interval '24 hours';
  select count(*) into v_active_7d
  from public.wallets where last_active_at >= now() - interval '7 days';

  select count(*) into v_mining_active
  from public.mining_sessions where status = 'mining';
  select count(*) into v_ready_claim
  from public.mining_sessions where status = 'mining' and end_time <= now();

  select coalesce(sum(amount), 0) into v_mined_total
  from public.transactions where tx_type = 'mining' and status = 'Complete';
  select count(*) into v_claimed_total
  from public.mining_sessions where status = 'completed';

  select count(*), coalesce(sum(points_amount), 0), coalesce(sum(amount), 0)
    into v_swap_count, v_swapped_points, v_coop_from_swaps
  from public.transactions
  where tx_type = 'swap' and status = 'Complete' and direction = 'points_to_coop';

  select count(*), coalesce(sum(amount), 0)
    into v_task_claims, v_task_rewards
  from public.transactions
  where tx_type = 'task' and status = 'Complete';

  select count(*), coalesce(sum(amount), 0)
    into v_send_count, v_sent_total
  from public.transactions
  where tx_type = 'send' and status = 'Complete';

  select total_coop_reward_pool, remaining_coop_reward_pool, points_per_coop
    into v_pool_total, v_pool_left, v_ppc
  from public.admin_settings where id = 'default';

  return jsonb_build_object(
    'total_users', coalesce(v_total_users, 0),
    'new_users_24h', coalesce(v_new_24h, 0),
    'active_users_7d', coalesce(v_active_7d, 0),
    'mining_active', coalesce(v_mining_active, 0),
    'ready_to_claim', coalesce(v_ready_claim, 0),
    'mined_total_cooptoken', coalesce(v_mined_total, 0),
    'mining_claims', coalesce(v_claimed_total, 0),
    'swap_count', coalesce(v_swap_count, 0),
    'swapped_points', coalesce(v_swapped_points, 0),
    'coop_from_swaps', coalesce(v_coop_from_swaps, 0),
    'task_claims', coalesce(v_task_claims, 0),
    'task_rewards', coalesce(v_task_rewards, 0),
    'send_count', coalesce(v_send_count, 0),
    'sent_total_coop', coalesce(v_sent_total, 0),
    'pool_total', coalesce(v_pool_total, 0),
    'pool_left', coalesce(v_pool_left, 0),
    'points_per_coop', coalesce(v_ppc, 10)
  );
end;
$$;

-- ---------- TIMESERIES (last N days, one row per UTC day) ----------
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
      'task_claims', (select count(*) from public.transactions t where t.tx_type='task' and (t.created_at at time zone 'utc')::date = days.d)
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

-- ---------- SINGLE WALLET DETAIL (no secrets) + recent activity ----------
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
    ), '[]'::jsonb)
  );
end;
$$;
-- ============ PART 2: TX FEED / SWAPS / MINING =============
-- TX FEED
create or replace function public.rpc_admin_transactions(
  p_admin_key text default null, p_type text default 'all',
  p_search text default null, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer
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

-- SWAPS
create or replace function public.rpc_admin_swaps(
  p_admin_key text default null, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_lim integer; v_off integer; v_total bigint;
  v_count bigint; v_pts numeric; v_coop numeric;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  v_lim := greatest(1, least(200, coalesce(p_limit, 50)));
  v_off := greatest(0, coalesce(p_offset, 0));
  select count(*), coalesce(sum(points_amount),0), coalesce(sum(amount),0)
    into v_count, v_pts, v_coop from public.transactions
   where tx_type='swap' and status='Complete' and direction='points_to_coop';
  select count(*) into v_total from public.transactions where tx_type='swap';
  return jsonb_build_object(
    'totals', jsonb_build_object('count', coalesce(v_count,0), 'points', coalesce(v_pts,0), 'coop', coalesce(v_coop,0)),
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
-- MINING
create or replace function public.rpc_admin_mining(
  p_admin_key text default null, p_state text default 'all',
  p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_lim integer; v_off integer;
  v_active bigint; v_ready bigint; v_claims bigint; v_mined numeric;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  v_lim := greatest(1, least(200, coalesce(p_limit, 50)));
  v_off := greatest(0, coalesce(p_offset, 0));
  -- active = open session; ready = open session whose allotment elapsed; claims = credited sessions
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
-- ============ PART 3: TASKS / BOOSTS / RECENT / GRANTS =============
-- PART3a: tasks catalog
create or replace function public.rpc_admin_tasks(p_admin_key text default null)
returns jsonb language plpgsql stable security definer
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
      'action_url', t.action_url, 'icon', t.icon
    ) order by t.id) from public.tasks t
  ), '[]'::jsonb));
end;
$$;

-- PART3b: task upsert/delete
create or replace function public.rpc_admin_upsert_task(
  p_admin_key text default null, p_id text default null, p_title text default null,
  p_description text default '', p_category text default 'social',
  p_reward numeric default 0, p_action_url text default '', p_icon text default 'check'
)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare v_ok boolean;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  if p_id is null or p_id='' then raise exception 'Task id required'; end if;
  if p_title is null or p_title='' then raise exception 'Task title required'; end if;
  if p_category not in ('all','social','special') then raise exception 'Invalid category'; end if;
  insert into public.tasks (id, title, description, category, reward_cooptoken, action_url, icon)
  values (p_id, p_title, coalesce(p_description,''), p_category, coalesce(p_reward,0),
          nullif(coalesce(p_action_url,''),''), coalesce(nullif(p_icon,''),'check'))
  on conflict (id) do update set title=excluded.title, description=excluded.description,
    category=excluded.category, reward_cooptoken=excluded.reward_cooptoken,
    action_url=excluded.action_url, icon=excluded.icon;
  return jsonb_build_object('success', true, 'id', p_id);
end;
$$;
create or replace function public.rpc_admin_delete_task(
  p_admin_key text default null, p_id text default null
)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare v_ok boolean;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  if p_id is null then raise exception 'Task id required'; end if;
  delete from public.tasks where id=p_id;
  return jsonb_build_object('success', true);
end;
$$;
-- PART3c: boosts + recent + grants
create or replace function public.rpc_admin_boosts(p_admin_key text default null)
returns jsonb language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_tiers jsonb; v_enabled boolean; v_stack boolean; v_active bigint; v_expired bigint;
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
create or replace function public.rpc_admin_recent(p_admin_key text default null, p_limit integer default 12)
returns jsonb language plpgsql stable security definer
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
grant execute on function public.rpc_admin_authorized(text) to anon, authenticated;
grant execute on function public.rpc_admin_overview(text) to anon, authenticated;
grant execute on function public.rpc_admin_timeseries(text, integer) to anon, authenticated;
grant execute on function public.rpc_admin_wallets(text, text, integer, integer, text) to anon, authenticated;
grant execute on function public.rpc_admin_wallet_detail(text, uuid) to anon, authenticated;
grant execute on function public.rpc_admin_transactions(text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.rpc_admin_swaps(text, integer, integer) to anon, authenticated;
grant execute on function public.rpc_admin_mining(text, text, integer, integer) to anon, authenticated;
grant execute on function public.rpc_admin_tasks(text) to anon, authenticated;
grant execute on function public.rpc_admin_upsert_task(text, text, text, text, text, numeric, text, text) to anon, authenticated;
grant execute on function public.rpc_admin_delete_task(text, text) to anon, authenticated;
grant execute on function public.rpc_admin_boosts(text) to anon, authenticated;
grant execute on function public.rpc_admin_recent(text, integer) to anon, authenticated;
