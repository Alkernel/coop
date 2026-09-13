-- ============================================================
-- MIGRATION v7 - Claim gate + mining constraint cleanup + Support Chat
-- Run this in Supabase SQL Editor. Idempotent (safe to re-run).
--
-- 1. mining_sessions: drops stale check constraints on the live DB
--    (the "new row for relation mining_sessions violates check
--    constraint" error) and re-adds the correct one.
-- 2. rpc_claim_mining: user can ONLY claim after the 12h countdown
--    ends. No early stop-and-claim bypass. Full session reward =
--    base_rate * 12h * (1 + boost). After claiming, a new session
--    can be started.
-- 3. rpc_stop_mining: rewritten to enforce the same countdown gate.
-- 4. Support chat: user <-> admin conversations stored in Supabase.
-- ============================================================

-- 1. Fix mining_sessions check constraints (live-DB drift)
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.mining_sessions'::regclass and contype = 'c'
  loop
    execute format('alter table public.mining_sessions drop constraint if exists %I', r.conname);
  end loop;
end;
$$;

alter table public.mining_sessions
  add constraint mining_sessions_status_check
  check (status in ('mining', 'completed'));

-- 2. CLAIM: allowed only when the countdown has finished
create or replace function public.rpc_claim_mining(p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_wallet public.wallets%rowtype;
  v_session public.mining_sessions%rowtype;
  v_hours numeric;
  v_reward numeric;
  v_tx_hash text;
begin
  select * into v_session from public.mining_sessions
  where wallet_id = p_wallet_id and status = 'mining'
  order by created_at desc limit 1
  for update;

  if not found then
    raise exception 'No active mining session. Press Start Mining first.';
  end if;

  -- Server clock is authoritative: the FULL countdown must be done
  if now() < v_session.end_time then
    raise exception 'Mining countdown is not finished yet';
  end if;

  v_hours := extract(epoch from (v_session.end_time - v_session.start_time)) / 3600.0;
  v_reward := round(v_hours * v_session.base_rate * (1 + v_session.boost_pct / 100.0), 4);

  if v_reward <= 0 then
    raise exception 'Nothing to claim yet';
  end if;

  update public.mining_sessions
  set status = 'completed',
      credited_hours = round(v_hours, 4),
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
    'Mining claim: ' || round(v_hours, 2) || 'h session at ' || v_session.base_rate::text ||
      ' Coopoint/hour (boost +' || v_session.boost_pct::text || '%)'
  );

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'session', (select to_jsonb(s) from public.mining_sessions s where s.id = v_session.id),
    'reward', v_reward,
    'tx_hash', v_tx_hash
  );
end;
$$;

-- Backward-compatible: old clients calling stop must also wait for the countdown
create or replace function public.rpc_stop_mining(p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
as $$
begin
  return public.rpc_claim_mining(p_wallet_id);
end;
$$;

-- ------------------------------------------------------------
-- 3. SUPPORT CHAT (user <-> admin, stored in Supabase)
--    RLS enabled, no policies: reachable ONLY through the RPCs.
-- ------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  name text not null default '',
  email text not null default '',
  subject text not null default 'Support request',
  status text not null default 'open',
  last_message_at timestamptz not null default now(),
  user_last_seen_at timestamptz not null default now(),
  admin_last_seen_at timestamptz,
  unread_for_admin integer not null default 0,
  unread_for_user integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.support_tickets(id) on delete cascade not null,
  sender text not null check (sender in ('user', 'admin')),
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.support_messages enable row level security;
create index if not exists idx_support_msg_ticket on public.support_messages(ticket_id, created_at);

-- ---------- USER SIDE ----------
create or replace function public.rpc_support_open_ticket(
  p_wallet_id uuid, p_name text, p_email text, p_subject text, p_message text
)
returns jsonb
language plpgsql
security definer
as $$
declare v_ticket public.support_tickets%rowtype;
begin
  if p_message is null or length(trim(p_message)) = 0 then
    raise exception 'Message cannot be empty';
  end if;

  -- One open conversation per wallet (reopened if previously closed)
  select * into v_ticket from public.support_tickets
  where wallet_id = p_wallet_id order by created_at desc limit 1;

  if found and v_ticket.status <> 'closed' then
    update public.support_tickets
    set user_last_seen_at = now(), last_message_at = now(), unread_for_admin = unread_for_admin + 1
    where id = v_ticket.id returning * into v_ticket;
  else
    insert into public.support_tickets (wallet_id, name, email, subject, status, unread_for_admin)
    values (p_wallet_id, coalesce(trim(p_name), 'User'), coalesce(trim(p_email), ''),
            coalesce(nullif(trim(p_subject), ''), 'Support request'), 'open', 1)
    returning * into v_ticket;
  end if;

  insert into public.support_messages (ticket_id, sender, body)
  values (v_ticket.id, 'user', left(trim(p_message), 2000));

  return to_jsonb(v_ticket);
end;
$$;

create or replace function public.rpc_support_send(p_ticket_id uuid, p_wallet_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
as $$
declare v_t public.support_tickets%rowtype;
begin
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'Message cannot be empty';
  end if;
  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;

  insert into public.support_messages (ticket_id, sender, body)
  values (p_ticket_id, 'user', left(trim(p_body), 2000));

  update public.support_tickets
  set last_message_at = now(), user_last_seen_at = now(), unread_for_admin = unread_for_admin + 1
  where id = p_ticket_id returning * into v_t;

  return to_jsonb(v_t);
end;
$$;

-- Poll: messages + presence. Marks admin messages as read for the user.
create or replace function public.rpc_support_poll(p_ticket_id uuid, p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_t public.support_tickets%rowtype;
  v_admin_online boolean;
begin
  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;

  update public.support_tickets
  set user_last_seen_at = now(), unread_for_user = 0
  where id = p_ticket_id;

  v_admin_online := v_t.admin_last_seen_at is not null
    and v_t.admin_last_seen_at > now() - interval '90 seconds';

  return jsonb_build_object(
    'ticket', to_jsonb(v_t),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at
      ) order by m.created_at)
      from public.support_messages m where m.ticket_id = p_ticket_id
    ), '[]'::jsonb),
    'admin_online', v_admin_online
  );
end;
$$;

-- ---------- ADMIN SIDE (authorized via admin_users / admin key) ----------
create or replace function public.rpc_support_admin_list(p_admin_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_ok boolean;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'wallet_id', t.wallet_id, 'address', w.address,
      'name', t.name, 'email', t.email, 'subject', t.subject,
      'status', t.status, 'last_message_at', t.last_message_at,
      'unread_for_admin', t.unread_for_admin,
      'user_online', t.user_last_seen_at > now() - interval '90 seconds',
      'preview', (select m.body from public.support_messages m
                  where m.ticket_id = t.id order by m.created_at desc limit 1)
    ) order by t.last_message_at desc)
    from public.support_tickets t
    left join public.wallets w on w.id = t.wallet_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.rpc_support_admin_poll(
  p_admin_key text default null, p_ticket_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_t public.support_tickets%rowtype;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;

  select * into v_t from public.support_tickets where id = p_ticket_id;
  if not found then raise exception 'Ticket not found'; end if;

  -- Admin presence + mark user messages as read (delivered to admin)
  update public.support_tickets
  set admin_last_seen_at = now(), unread_for_admin = 0
  where id = p_ticket_id;

  select * into v_t from public.support_tickets where id = p_ticket_id;

  return jsonb_build_object(
    'ticket', to_jsonb(v_t),
    'user_online', v_t.user_last_seen_at > now() - interval '90 seconds',
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at
      ) order by m.created_at)
      from public.support_messages m where m.ticket_id = p_ticket_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_support_admin_reply(
  p_admin_key text default null, p_ticket_id uuid default null, p_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_admin text;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  if p_body is null or length(trim(p_body)) = 0 then raise exception 'Message cannot be empty'; end if;
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;

  if not exists (select 1 from public.support_tickets where id = p_ticket_id) then
    raise exception 'Ticket not found';
  end if;

  insert into public.support_messages (ticket_id, sender, body)
  values (p_ticket_id, 'admin', left(trim(p_body), 2000));

  v_admin := public.rpc_admin_identity();
  update public.support_tickets
  set last_message_at = now(), admin_last_seen_at = now(),
      unread_for_admin = 0, unread_for_user = unread_for_user + 1,
      status = 'open'
  where id = p_ticket_id;

  return jsonb_build_object('success', true, 'admin', v_admin);
end;
$$;

create or replace function public.rpc_support_admin_close(
  p_admin_key text default null, p_ticket_id uuid default null
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
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;
  update public.support_tickets set status = 'closed' where id = p_ticket_id;
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.rpc_support_open_ticket(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.rpc_support_send(uuid, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_poll(uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_list(text) to anon, authenticated;
grant execute on function public.rpc_support_admin_poll(text, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_reply(text, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_admin_close(text, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_close(text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. TYPING INDICATORS + 24h daily cap (two 12h sessions per day)
-- ------------------------------------------------------------
alter table public.support_tickets
  add column if not exists user_typing_at timestamptz,
  add column if not exists admin_typing_at timestamptz;

-- Two full 12h sessions per day (12 + 12), each claiming 1200 Coopoint at 100/h
update public.admin_settings set base_mining_rate = 100.0000, daily_mining_hours = 24 where id = 'default';

-- Sessions are FIXED 12-hour countdowns (no partial/early-claim; no 24h session).
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
  if v_remaining_hours < 12 then
    raise exception 'Daily mining limit reached. A full 12-hour session no longer fits today. Mining resets at 00:00 UTC';
  end if;

  v_boost := public._active_boost_pct(p_wallet_id, v_settings.boosts_stackable);

  insert into public.mining_sessions (
    wallet_id, start_time, end_time, base_rate, boost_pct, status
  ) values (
    p_wallet_id,
    now(),
    now() + interval '12 hours',
    v_settings.base_mining_rate,
    v_boost,
    'mining'
  ) returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

grant execute on function public.rpc_start_mining(uuid) to anon, authenticated;
grant execute on function public.rpc_claim_mining(uuid) to anon, authenticated;

-- Typing signal: user side (no admin key) or admin side (authorized)
create or replace function public.rpc_support_typing(
  p_ticket_id uuid, p_wallet_id uuid default null, p_admin_key text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare v_ok boolean;
begin
  if p_admin_key is not null then
    v_ok := public.rpc_admin_authorized(p_admin_key);
    if not v_ok then raise exception 'Unauthorized'; end if;
    update public.support_tickets set admin_typing_at = now() where id = p_ticket_id;
  else
    if p_wallet_id is null then raise exception 'Wallet id required'; end if;
    update public.support_tickets set user_typing_at = now()
    where id = p_ticket_id and wallet_id = p_wallet_id;
  end if;
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.rpc_support_typing(uuid, uuid, text) to anon, authenticated;

-- Re-define polls to include typing flags
create or replace function public.rpc_support_poll(p_ticket_id uuid, p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_t public.support_tickets%rowtype;
  v_admin_online boolean;
begin
  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;

  update public.support_tickets
  set user_last_seen_at = now(), unread_for_user = 0
  where id = p_ticket_id;

  select * into v_t from public.support_tickets where id = p_ticket_id;

  v_admin_online := v_t.admin_last_seen_at is not null
    and v_t.admin_last_seen_at > now() - interval '90 seconds';

  return jsonb_build_object(
    'ticket', to_jsonb(v_t),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at
      ) order by m.created_at)
      from public.support_messages m where m.ticket_id = p_ticket_id
    ), '[]'::jsonb),
    'admin_online', v_admin_online,
    'admin_typing', v_t.admin_typing_at is not null
      and v_t.admin_typing_at > now() - interval '6 seconds'
  );
end;
$$;

create or replace function public.rpc_support_admin_poll(
  p_admin_key text default null, p_ticket_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_ok boolean; v_t public.support_tickets%rowtype;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key);
  if not v_ok then raise exception 'Unauthorized'; end if;
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;

  select * into v_t from public.support_tickets where id = p_ticket_id;
  if not found then raise exception 'Ticket not found'; end if;

  update public.support_tickets
  set admin_last_seen_at = now(), unread_for_admin = 0
  where id = p_ticket_id;

  select * into v_t from public.support_tickets where id = p_ticket_id;

  return jsonb_build_object(
    'ticket', to_jsonb(v_t),
    'user_online', v_t.user_last_seen_at > now() - interval '90 seconds',
    'user_typing', v_t.user_typing_at is not null
      and v_t.user_typing_at > now() - interval '6 seconds',
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at
      ) order by m.created_at)
      from public.support_messages m where m.ticket_id = p_ticket_id
    ), '[]'::jsonb)
  );
end;
$$;