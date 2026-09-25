-- ===========================================================================
-- Coop Explorer index + COOP market data
-- ---------------------------------------------------------------------------
-- Scope: the Coop Explorer indexes ON-LEDGER COOP COIN TRANSFERS only
-- (public.transactions rows with currency = 'COOP' and tx_type = send/receive).
-- Coopoint is an off-chain points balance stored in the database — it is not a
-- chain transaction, has no tx hash of its own and therefore never appears here.
--
-- Every number returned by this file is computed from real rows in
-- public.transactions / public.wallets / public.admin_settings. Nothing is
-- invented, sampled or hardcoded. The COOP reference price is admin-controlled
-- (admin_settings.coop_price_usd); 0 means "not set yet" and the UI says so.
--
-- Read-only, no secrets exposed (never selects private_key_hash or pin_code).
-- Apply once in the Supabase SQL editor. Safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. COOP reference price (admin-controlled). 0 = not set yet.
-- ---------------------------------------------------------------------------
alter table public.admin_settings
  add column if not exists coop_price_usd numeric(20, 6) not null default 0;

-- ---------------------------------------------------------------------------
-- 2. Public market snapshot: price + real supply/holder numbers.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_get_coop_market()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with s as (select * from public.admin_settings where id = 'default')
  select jsonb_build_object(
    'coop_price_usd', coalesce((select coop_price_usd from s), 0),
    'points_per_coop', coalesce((select points_per_coop from s), 0),
    'pool_total', coalesce((select total_coop_reward_pool from s), 0),
    'pool_remaining', coalesce((select remaining_coop_reward_pool from s), 0),
    'circulating_supply', coalesce((select sum(coop_balance) from public.wallets), 0),
    'holder_count', coalesce((select count(*) from public.wallets where coop_balance > 0), 0),
    'wallet_count', coalesce((select count(*) from public.wallets), 0)
  );
$$;
grant execute on function public.rpc_get_coop_market() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin: set the COOP reference price (same auth boundary as the dashboard).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_admin_set_coop_price(
  p_admin_key text,
  p_price_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_price numeric;
begin
  if not public.rpc_admin_authorized(p_admin_key) then
    raise exception 'Unauthorized';
  end if;
  v_price := greatest(0, coalesce(p_price_usd, 0));
  update public.admin_settings
     set coop_price_usd = v_price,
         updated_at = timezone('utc'::text, now())
   where id = 'default';
  return jsonb_build_object('coop_price_usd', v_price);
end;
$$;
grant execute on function public.rpc_admin_set_coop_price(text, numeric) to anon, authenticated;
-- ---------------------------------------------------------------------------
-- 4. Transfer stats (COOP coin transfers only).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_explorer_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with coop as (
    select * from public.transactions
    where currency = 'COOP' and tx_type in ('send', 'receive')
  )
  select jsonb_build_object(
    'total', (select count(*) from coop),
    'completed', (select count(*) from coop
      where lower(coalesce(status, '')) in ('complete', 'completed')),
    'pending', (select count(*) from coop
      where lower(coalesce(status, '')) = 'pending'),
    'failed', (select count(*) from coop
      where lower(coalesce(status, '')) = 'failed'),
    'wallets', (select count(distinct wallet_id) from coop),
    'first_created_at', (select min(created_at) from coop),
    'last_created_at', (select max(created_at) from coop)
  );
$$;
grant execute on function public.rpc_explorer_stats() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Recent COOP transfers (paged + filterable by type / status).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_explorer_recent(
  p_limit integer default 25,
  p_offset integer default 0,
  p_type text default 'all',
  p_status text default 'all'
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with coop as (
    select t.*, w.address as wallet_address
    from public.transactions t
    left join public.wallets w on w.id = t.wallet_id
    where t.currency = 'COOP' and t.tx_type in ('send', 'receive')
      and (p_type is null or p_type = 'all' or t.tx_type = p_type)
      and (p_status is null or p_status = 'all'
        or (p_status = 'completed' and lower(coalesce(t.status, '')) in ('complete', 'completed'))
        or (p_status = 'pending' and lower(coalesce(t.status, '')) = 'pending')
        or (p_status = 'failed' and lower(coalesce(t.status, '')) = 'failed'))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'wallet_id', t.wallet_id, 'wallet_address', t.wallet_address,
      'tx_type', t.tx_type, 'amount', t.amount, 'currency', t.currency,
      'points_amount', t.points_amount, 'direction', t.direction,
      'counterparty', t.counterparty, 'fee', t.fee, 'status', t.status,
      'tx_hash', t.tx_hash, 'notes', t.notes, 'created_at', t.created_at
    ) order by t.created_at desc), '[]'::jsonb)
  from (
    select * from coop
    order by created_at desc
    limit greatest(1, least(200, coalesce(p_limit, 25)))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;
$$;
grant execute on function public.rpc_explorer_recent(integer, integer, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. One transfer hash: all ledger entries (a transfer writes two rows).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_explorer_tx(p_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'wallet_id', t.wallet_id, 'wallet_address', t.wallet_address,
      'tx_type', t.tx_type, 'amount', t.amount, 'currency', t.currency,
      'points_amount', t.points_amount, 'direction', t.direction,
      'counterparty', t.counterparty, 'fee', t.fee, 'status', t.status,
      'tx_hash', t.tx_hash, 'notes', t.notes, 'created_at', t.created_at
    ) order by t.created_at asc), '[]'::jsonb)
  from (
    select t.*, w.address as wallet_address
    from public.transactions t
    left join public.wallets w on w.id = t.wallet_id
    where t.tx_hash = p_hash
      and t.currency = 'COOP' and t.tx_type in ('send', 'receive')
  ) t;
$$;
grant execute on function public.rpc_explorer_tx(text) to anon, authenticated;
-- ---------------------------------------------------------------------------
-- 7. One address: its own COOP transfer rows (uses the wallet index).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_explorer_address(
  p_address text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare v_wallet uuid; v_total bigint;
begin
  select id into v_wallet
    from public.wallets
   where lower(address) = lower(trim(coalesce(p_address, '')))
   limit 1;

  if v_wallet is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'indexed', true);
  end if;

  select count(*) into v_total
    from public.transactions
   where wallet_id = v_wallet
     and currency = 'COOP' and tx_type in ('send', 'receive');

  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', t.id, 'wallet_id', t.wallet_id, 'wallet_address', t.wallet_address,
          'tx_type', t.tx_type, 'amount', t.amount, 'currency', t.currency,
          'points_amount', t.points_amount, 'direction', t.direction,
          'counterparty', t.counterparty, 'fee', t.fee, 'status', t.status,
          'tx_hash', t.tx_hash, 'notes', t.notes, 'created_at', t.created_at
        ) order by t.created_at desc)
      from (
        select t.*, w.address as wallet_address
        from public.transactions t
        left join public.wallets w on w.id = t.wallet_id
        where t.wallet_id = v_wallet
          and t.currency = 'COOP' and t.tx_type in ('send', 'receive')
        order by t.created_at desc
        limit greatest(1, least(200, coalesce(p_limit, 50)))
        offset greatest(0, coalesce(p_offset, 0))
      ) t
    ), '[]'::jsonb),
    'total', v_total,
    'indexed', true
  );
end;
$$;
grant execute on function public.rpc_explorer_address(text, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Holders: real COOP balances, ranked, with share of circulating supply.
--    Addresses only — never PIN or key material.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_explorer_holders(p_limit integer default 25)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with supply as (
    select coalesce(sum(coop_balance), 0) as total from public.wallets
  ),
  ranked as (
    select w.address,
           w.coop_balance,
           w.last_active_at,
           (select count(*) from public.transactions t
             where t.wallet_id = w.id
               and t.currency = 'COOP' and t.tx_type in ('send', 'receive')) as tx_count,
           row_number() over (order by w.coop_balance desc, w.address) as rank_no
    from public.wallets w
    where w.coop_balance > 0
  )
  select jsonb_build_object(
    'total_supply', (select total from supply),
    'holder_count', (select count(*) from ranked),
    'holders', coalesce((
      select jsonb_agg(jsonb_build_object(
          'rank', r.rank_no,
          'address', r.address,
          'balance', r.coop_balance,
          'tx_count', r.tx_count,
          'last_active_at', r.last_active_at,
          'share_pct', case
            when (select total from supply) > 0
            then round((r.coop_balance / (select total from supply)) * 100, 6)
            else 0 end
        ) order by r.rank_no)
      from (
        select * from ranked
        order by rank_no
        limit greatest(1, least(100, coalesce(p_limit, 25)))
      ) r
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.rpc_explorer_holders(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Activity: daily COOP sent/received volume + unique wallets. Buy/sell and
--    transfer pressure are taken from these real flows, never from a guess.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_explorer_activity(p_days integer default 14)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with coop as (
    select * from public.transactions
    where currency = 'COOP' and tx_type in ('send', 'receive')
      and created_at >= (now() - make_interval(days => greatest(1, least(90, coalesce(p_days, 14)))))
  ),
  per_day as (
    select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
           sum(case when tx_type = 'send' then amount else 0 end) as sent,
           sum(case when tx_type = 'receive' then amount else 0 end) as received,
           count(*) as tx_count,
           count(distinct wallet_id) as wallet_count
    from coop
    group by 1
  )
  select jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
          'date', day, 'sent', sent, 'received', received,
          'tx_count', tx_count, 'wallet_count', wallet_count
        ) order by day)
      from per_day), '[]'::jsonb),
    'total_sent', coalesce((select sum(amount) from coop where tx_type = 'send'), 0),
    'total_received', coalesce((select sum(amount) from coop where tx_type = 'receive'), 0),
    'total_tx', coalesce((select count(*) from coop), 0),
    'unique_wallets', coalesce((select count(distinct wallet_id) from coop), 0)
  );
$$;
grant execute on function public.rpc_explorer_activity(integer) to anon, authenticated;
