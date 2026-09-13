-- ============================================================
-- MIGRATION v6 — Mining interval fix + transfer memo/comments
-- Run this in Supabase SQL Editor. Idempotent (safe to re-run).
--
-- Fixes:
--   1. rpc_start_mining crashed with:
--      "function make_interval(hours => numeric) does not exist"
--      -> replaced with `v_remaining_hours * interval '1 hour'`.
--   2. rpc_execute_send now accepts an optional p_memo (sender
--      comment, max 200 chars) stored on BOTH ledger rows so the
--      recipient can see who sent the coin and why.
-- ============================================================

-- ============================================================
-- FIX 1: rpc_start_mining crashed on live DB with:
--   "function make_interval(hours => numeric) does not exist"
-- make_interval(hours) takes int, not numeric. Replaced with
-- `v_remaining_hours * interval '1 hour'`.
-- ============================================================
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
    now() + (v_remaining_hours * interval '1 hour'),
    v_settings.base_mining_rate,
    v_boost,
    'mining'
  ) returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

-- ---------- 2. SEND COOPCoin (atomic + optional memo) ----------
create or replace function public.rpc_execute_send(
  p_wallet_id uuid,
  p_recipient text,
  p_amount numeric,
  p_client_nonce text default null,
  p_memo text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_amount numeric(20, 4);
  v_recipient_addr text;
  v_memo text;
  v_wallet public.wallets%rowtype;
  v_recipient_wallet public.wallets%rowtype;
  v_tx_hash text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  v_amount := round(p_amount, 4);
  if v_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if p_recipient is null or length(trim(p_recipient)) < 10 then
    raise exception 'Recipient address is invalid';
  end if;
  v_recipient_addr := trim(p_recipient);

  if p_client_nonce is null or length(p_client_nonce) < 8 then
    raise exception 'Invalid request';
  end if;

  -- Lock sender row first (serializes concurrent sends -> no double spend).
  select * into v_wallet from public.wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'Wallet not found';
  end if;

  if lower(v_wallet.address) = lower(v_recipient_addr) then
    raise exception 'You cannot send COOPCoin to yourself';
  end if;

  -- Recipient MUST exist and is locked before any balance moves.
  select * into v_recipient_wallet
  from public.wallets where lower(address) = lower(v_recipient_addr) for update;
  if not found then
    raise exception 'Recipient not found. Check the COOP wallet address and try again.';
  end if;

  -- Idempotency: same (sender, nonce) can never execute twice.
  begin
    insert into public.transfer_requests (wallet_id, client_nonce)
    values (p_wallet_id, p_client_nonce);
  exception when unique_violation then
    raise exception 'Duplicate transfer rejected';
  end;

  if v_wallet.coop_balance < v_amount then
    raise exception 'Insufficient COOPCoin balance';
  end if;

  update public.wallets
  set coop_balance = coop_balance - v_amount,
      total_sent = total_sent + v_amount,
      last_active_at = now()
  where id = p_wallet_id
  returning * into v_wallet;

  update public.wallets
  set coop_balance = coop_balance + v_amount,
      total_received = total_received + v_amount,
      last_active_at = now()
  where id = v_recipient_wallet.id
  returning * into v_recipient_wallet;

  v_tx_hash := '0x' || md5(random()::text || clock_timestamp()::text || p_wallet_id::text);

  -- Optional sender comment, shown to the recipient on the transaction detail page.
  v_memo := nullif(trim(coalesce(p_memo, '')), '');
  if v_memo is not null and length(v_memo) > 200 then
    v_memo := substring(v_memo from 1 for 200);
  end if;

  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id, 'send', v_amount, 'COOP', v_recipient_wallet.address, 0, 'Completed', v_tx_hash,
    'Sent ' || v_amount::text || ' COOPCoin to ' || v_recipient_wallet.address
      || ' (internal transfer, no blockchain hash yet)'
      || case when v_memo is not null then ' | Memo: ' || v_memo else '' end
  );

  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    v_recipient_wallet.id, 'receive', v_amount, 'COOP', v_wallet.address, 0, 'Completed', v_tx_hash,
    'Received ' || v_amount::text || ' COOPCoin from ' || v_wallet.address
      || ' (internal transfer, no blockchain hash yet)'
      || case when v_memo is not null then ' | Memo: ' || v_memo else '' end
  );

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'recipient_address', v_recipient_wallet.address,
    'amount', v_amount,
    'fee', 0,
    'status', 'Completed',
    'tx_hash', v_tx_hash,
    'memo', v_memo
  );
end;
$$;

-- Keep RPCs reachable by the web app
grant execute on function public.rpc_start_mining(uuid) to anon, authenticated;
grant execute on function public.rpc_execute_send(uuid, text, numeric, text, text) to anon, authenticated;
