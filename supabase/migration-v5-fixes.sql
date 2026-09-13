-- =============================================================
-- MIGRATION V5 — CONSTRAINT FIXES + MINING RATE + COOP REWARDS
-- Safe to re-run. Fixes these live-DB problems:
--   1. transactions.status check constraint rejects 'Completed'
--      (this is what broke user-to-user COOP sends)
--   2. transactions.tx_type check constraint rejects 'admin'
--      (this broke admin balance adjustments)
--   3. Mining rate set to 100 Coopoint/hour, mining enabled
--   4. Admin adjustments now appear to users as "Coop Rewards"
-- =============================================================

-- ---------- 1. Rebuild transactions check constraints (permissive) ----------
do $$
declare
  r record;
begin
  -- Drop every check constraint on tx_type and status (names vary between installs)
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%tx_type%'
        or pg_get_constraintdef(oid) like '%status%')
  loop
    execute format('alter table public.transactions drop constraint if exists %I', r.conname);
  end loop;
end;
$$;

alter table public.transactions
  add constraint transactions_tx_type_check
  check (tx_type in ('send', 'receive', 'swap', 'mining', 'boost', 'task', 'admin'));

alter table public.transactions
  add constraint transactions_status_check
  check (status in ('Pending', 'Complete', 'Completed', 'Failed'));

-- ---------- 2. Mining economy: 100 Coopoint per hour, 12h day, enabled ----------
update public.admin_settings
set base_mining_rate  = 100.0000,
    daily_mining_hours = 12.00,
    mining_enabled    = true,
    updated_at        = now()
where id = 'default';

-- ---------- 3. Admin adjustments surface as "Coop Rewards" to users ----------
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

  v_tx_hash := 'reward-' || md5(clock_timestamp()::text || p_wallet_id::text || v_delta::text || random()::text);

  insert into public.transactions (
    wallet_id, tx_type, amount, currency, points_amount, direction,
    counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id, 'admin', abs(v_delta), v_cur,
    case when v_cur = 'Cooptoken' then abs(v_delta) else 0 end,
    case when v_delta > 0 then 'credit' else 'debit' end,
    'Coop Rewards', 0, 'Completed', v_tx_hash,
    'Coop Rewards ' || case when v_delta > 0 then 'bonus' else 'adjustment' end
      || ' (' || case when v_delta > 0 then '+' else '' end
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

grant execute on function public.rpc_admin_adjust_balance(text, uuid, text, numeric, text) to anon, authenticated;