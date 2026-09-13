-- ============================================================
-- MIGRATION v4 — USER MODERATION / RESTRICTIONS
-- Lets admins restrict, suspend or ban users, and enforces the
-- restriction at the DATABASE level so it holds no matter which
-- screen or RPC the request comes from.
--
-- Statuses:
--   active     — everything allowed
--   restricted — can log in & view, but CANNOT send, swap, claim tasks or mine
--   suspended  — cannot log in at all (account frozen)
--   banned     — cannot log in, permanently removed from the platform
--
-- Idempotent — safe to re-run. Never deletes user data.
-- Run AFTER schema.sql and admin-dashboard.sql.
-- ============================================================

-- 1. Status columns on wallets ----------------------------------------------
alter table public.wallets add column if not exists status text not null default 'active';
alter table public.wallets add column if not exists restricted_reason text;
alter table public.wallets add column if not exists restricted_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wallets_status_check'
  ) then
    alter table public.wallets add constraint wallets_status_check
      check (status in ('active', 'restricted', 'suspended', 'banned'));
  end if;
end;
$$;

create index if not exists wallets_status_idx on public.wallets (status);

-- 2. Helper: readable status for a wallet ------------------------------------
create or replace function public.rpc_wallet_status(p_wallet_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(status, 'active') from public.wallets where id = p_wallet_id;
$$;

-- 3. DB-level enforcement: transactions -------------------------------------
-- Outgoing / reward actions are blocked for restricted, suspended and banned
-- wallets. Incoming transfers (receive) and admin adjustments still land so
-- the ledger stays truthful.
create or replace function public.trg_enforce_wallet_tx()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select coalesce(status, 'active') into v_status
  from public.wallets where id = new.wallet_id;

  if v_status <> 'active'
     and new.tx_type in ('send', 'swap', 'task', 'mining', 'boost') then
    raise exception 'Account %: this action is not available. Contact support.', v_status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_wallet_tx on public.transactions;
create trigger trg_enforce_wallet_tx
  before insert on public.transactions
  for each row execute function public.trg_enforce_wallet_tx();

-- 4. DB-level enforcement: mining sessions ----------------------------------
create or replace function public.trg_enforce_wallet_mining()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select coalesce(status, 'active') into v_status
  from public.wallets where id = new.wallet_id;

  if v_status <> 'active' then
    raise exception 'Account %: mining is not available. Contact support.', v_status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_wallet_mining on public.mining_sessions;
create trigger trg_enforce_wallet_mining
  before insert on public.mining_sessions
  for each row execute function public.trg_enforce_wallet_mining();

-- 5. Login guard: suspended / banned users cannot sign in --------------------
create or replace function public.rpc_authenticate_wallet(
  p_private_key text,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key_hash text;
  v_wallet public.wallets%rowtype;
begin
  v_key_hash := encode(digest(p_private_key, 'sha256'), 'hex');

  select * into v_wallet from public.wallets where private_key_hash = v_key_hash limit 1;

  if found then
    if v_wallet.status in ('suspended', 'banned') then
      raise exception 'Your account has been % by an administrator. Contact support.', v_wallet.status;
    end if;
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

-- 6. Admin: set user status (restrict / suspend / ban / restore) -------------
create or replace function public.rpc_admin_set_user_status(
  p_admin_key text default null,
  p_wallet_id uuid default null,
  p_status text default null,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_email text;
  v_prev text;
  v_reason text;
  v_wallet public.wallets%rowtype;
begin
  if not public.rpc_admin_authorized(p_admin_key) then
    raise exception 'Unauthorized';
  end if;
  if p_wallet_id is null then raise exception 'Wallet id required'; end if;
  if p_status not in ('active', 'restricted', 'suspended', 'banned') then
    raise exception 'Invalid status';
  end if;

  v_reason := coalesce(p_reason, '');
  if p_status <> 'active' and length(trim(v_reason)) < 3 then
    raise exception 'A reason of at least 3 characters is required';
  end if;

  select coalesce(status, 'active') into v_prev
  from public.wallets where id = p_wallet_id;
  if not found then raise exception 'Wallet not found'; end if;
  if v_prev = p_status then raise exception 'User is already %', p_status; end if;

  v_admin_email := public.rpc_admin_identity();

  update public.wallets set
    status = p_status,
    restricted_reason = case when p_status = 'active' then null else trim(v_reason) end,
    restricted_at = case when p_status = 'active' then null else now() end
  where id = p_wallet_id
  returning * into v_wallet;

  -- Restricting also force-stops any running mining session so the user
  -- cannot keep accruing while restricted.
  if p_status <> 'active' then
    update public.mining_sessions
    set status = 'completed',
        end_time = now(),
        credited_hours = greatest(0, extract(epoch from (now() - start_time)) / 3600.0)
    where wallet_id = p_wallet_id and status = 'active';
  end if;

  insert into public.admin_audit_log (
    admin_email, wallet_id, action, currency, delta, reason
  ) values (
    v_admin_email, p_wallet_id,
    'set_user_status: ' || v_prev || ' -> ' || p_status,
    'status', 0, coalesce(nullif(trim(v_reason), ''), 'status change')
  );

  return jsonb_build_object(
    'wallet_id', v_wallet.id,
    'status', v_wallet.status,
    'restricted_reason', v_wallet.restricted_reason,
    'restricted_at', v_wallet.restricted_at,
    'previous_status', v_prev
  );
end;
$$;

-- 7. Admin list & detail include status (redefined with the fields added) ----
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
        'status', coalesce(w.status, 'active'),
        'restricted_reason', w.restricted_reason,
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
      'status', coalesce(v_w.status, 'active'),
      'restricted_reason', v_w.restricted_reason,
      'restricted_at', v_w.restricted_at,
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

-- 8. Grants -------------------------------------------------------------------
grant execute on function public.rpc_wallet_status(uuid) to anon, authenticated;
grant execute on function public.rpc_admin_set_user_status(text, uuid, text, text) to anon, authenticated;