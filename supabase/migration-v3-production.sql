-- ==========================================================
-- COOP PRODUCTION MIGRATION v3 — non-destructive fixes.
-- Run AFTER supabase/schema.sql + supabase/admin-dashboard.sql.
-- Safe to re-run. NEVER deletes users, wallets, transactions.
-- ==========================================================
create extension if not exists pgcrypto;

-- 1. Transfer idempotency guard (prevents double-send / double-click /
--    replayed send requests). One row per (sender wallet, client nonce).
create table if not exists public.transfer_requests (
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  client_nonce text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (wallet_id, client_nonce)
);
-- Read/write only via SECURITY DEFINER RPCs (like swap_requests): no client policies.
alter table public.transfer_requests enable row level security;

-- 2. Backfill: swap rows written before points_amount existed.
update public.transactions
set points_amount = round(amount * (
  select points_per_coop from public.admin_settings where id = 'default'
), 4)
where tx_type = 'swap'
  and direction = 'points_to_coop'
  and (points_amount is null or points_amount = 0);

update public.transactions
set points_amount = round(amount, 4)
where tx_type = 'swap'
  and direction = 'coop_to_points'
  and (points_amount is null or points_amount = 0);

-- 3. REWRITE rpc_execute_send: atomic internal COOPCoin transfer.
--    - No network fee (internal ledger move; blockchain fees come later).
--    - Validates amount, recipient existence, self-send, balance (row lock).
--    - Idempotency nonce prevents duplicate submissions / double spending.
--    - BOTH users get a ledger row in the SAME transaction:
--        sender   'send'    -amount COOPCoin (counterparty = recipient address)
--        recipient 'receive' +amount COOPCoin (counterparty = sender address)
--    - Statuses use Pending -> Completed / Failed (never fake success).
create or replace function public.rpc_execute_send(
  p_wallet_id uuid,
  p_recipient text,
  p_amount numeric,
  p_client_nonce text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_amount numeric(20, 4);
  v_recipient_addr text;
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

  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id, 'send', v_amount, 'COOP', v_recipient_wallet.address, 0, 'Completed', v_tx_hash,
    'Sent ' || v_amount::text || ' COOPCoin to ' || v_recipient_wallet.address
      || ' (internal transfer, no blockchain hash yet)'
  );

  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    v_recipient_wallet.id, 'receive', v_amount, 'COOP', v_wallet.address, 0, 'Completed', v_tx_hash,
    'Received ' || v_amount::text || ' COOPCoin from ' || v_wallet.address
      || ' (internal transfer, no blockchain hash yet)'
  );

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'recipient_address', v_recipient_wallet.address,
    'amount', v_amount,
    'fee', 0,
    'status', 'Completed',
    'tx_hash', v_tx_hash
  );
end;
$$;

grant execute on function public.rpc_execute_send(uuid, text, numeric, text) to anon, authenticated;
