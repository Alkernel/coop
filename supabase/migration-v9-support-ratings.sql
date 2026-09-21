-- ============================================================
-- MIGRATION v9 - Mining claim fix + terminal chat end + support ratings
--
-- RUN `migration-v8-support-history.sql` FIRST, then this file.
-- Idempotent: safe to re-run.
--
-- Why this exists (all verified against the live database):
--
--  1. MINING CLAIM IS BROKEN.
--     rpc_claim_mining inserts currency = 'Coopoints'. The live
--     transactions CHECK constraint only accepts the older values,
--     so every claim died with:
--         new row for relation "transactions" violates check constraint ...
--     Proof: the live table contains 0 rows with currency 'Coopoints'
--     (only 'COOP'/'Cooptoken'), and every mining_sessions row is still
--     status='mining' with credited_hours=0.
--     migration-v5 rebuilt the tx_type/status checks but never touched
--     `currency`, which is where the drift actually is. Fixed here.
--     (This also unblocks task rewards, which write 'Coopoints' too.)
--
--  2. AN ENDED CHAT MUST STAY ENDED.
--     Once the user or the admin ends a conversation it is terminal: the
--     only way to talk to support again is to start a NEW chat. A new
--     ticket is created by rpc_support_open_ticket, so nothing is lost.
--
--  3. SUPPORT RATINGS PER CUSTOMER-SERVICE AGENT.
--     Ending a chat stores rating + comment against the ticket together
--     with the name of the agent who handled it, and
--     rpc_support_admin_ratings exposes a per-agent summary for the new
--     admin "Chat Ratings" section.
--
--  4. THE "CONTINUE / REOPEN" PATH IS GONE from the wording too.
--     rpc_support_send is re-created so an ended chat answers
--     "Start a new chat to talk to support again." instead of the old
--     "Tap Continue conversation to reopen it." (which no longer exists).
-- ============================================================

-- ------------------------------------------------------------
-- 1. FIX: rebuild the transactions CHECK constraints (incl. currency)
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%tx_type%'
        or pg_get_constraintdef(oid) like '%status%'
        or pg_get_constraintdef(oid) like '%currency%')
  loop
    execute format('alter table public.transactions drop constraint if exists %I', r.conname);
  end loop;
end;
$$;

-- Exactly the values the RPCs write (schema.sql intent). 'Coopoints' is the
-- one the live constraint was rejecting.
alter table public.transactions
  add constraint transactions_tx_type_check
  check (tx_type in ('send', 'receive', 'swap', 'mining', 'boost', 'task', 'admin'));

alter table public.transactions
  add constraint transactions_currency_check
  check (currency in ('COOP', 'Cooptoken', 'Coopoints'));

alter table public.transactions
  add constraint transactions_status_check
  check (status in ('Pending', 'Complete', 'Completed', 'Failed'));

-- ------------------------------------------------------------
-- 2. Make sure the support columns exist even if v8 was skipped
-- ------------------------------------------------------------
alter table public.support_tickets
  add column if not exists closed_by text,
  add column if not exists closed_at timestamptz,
  add column if not exists rating smallint,
  add column if not exists rating_comment text,
  add column if not exists user_typing_at timestamptz,
  add column if not exists admin_typing_at timestamptz,
  add column if not exists admin_name text;

-- ------------------------------------------------------------
-- 3. An ended chat is TERMINAL - reopening is refused on both sides
-- ------------------------------------------------------------
create or replace function public.rpc_support_reopen(p_ticket_id uuid, p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'This conversation has ended. Start a new chat to talk to support again.';
end;
$$;

create or replace function public.rpc_support_admin_reopen(
  p_admin_key text default null,
  p_ticket_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.rpc_admin_authorized(p_admin_key) then
    raise exception 'Unauthorized';
  end if;
  raise exception 'This conversation has ended and cannot be reopened. The user must start a new chat.';
end;
$$;

-- ------------------------------------------------------------
-- 4. Admin reply: never auto-reopens, and refuses a closed ticket
-- ------------------------------------------------------------
create or replace function public.rpc_support_admin_reply(
  p_admin_key text default null,
  p_ticket_id uuid default null,
  p_body text default null,
  p_admin_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_t public.support_tickets%rowtype;
begin
  if not public.rpc_admin_authorized(p_admin_key) then
    raise exception 'Unauthorized';
  end if;
  if p_ticket_id is null then
    raise exception 'Ticket id required';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'Message cannot be empty';
  end if;

  select * into v_t from public.support_tickets where id = p_ticket_id;
  if not found then raise exception 'Ticket not found'; end if;

  -- Terminal: an ended conversation cannot be revived by replying.
  if v_t.status = 'closed' then
    raise exception 'This conversation has ended. The user must start a new chat.';
  end if;

  insert into public.support_messages (ticket_id, sender, body)
  values (p_ticket_id, 'admin', left(trim(p_body), 2000));

  -- Remembers which agent is handling (and therefore who the rating scores).
  update public.support_tickets
  set last_message_at = now(),
      unread_for_user = unread_for_user + 1,
      admin_name = coalesce(nullif(trim(coalesce(p_admin_name, '')), ''), admin_name)
  where id = p_ticket_id
  returning * into v_t;

  return jsonb_build_object('success', true, 'ticket', to_jsonb(v_t), 'admin_name', v_t.admin_name);
end;
$$;

-- ------------------------------------------------------------
-- 4b. Sending into an ended chat is refused, with the correct advice
--     (the old v8 message still told the user to "continue" the chat)
-- ------------------------------------------------------------
create or replace function public.rpc_support_send(p_ticket_id uuid, p_wallet_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_t public.support_tickets%rowtype;
begin
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'Message cannot be empty';
  end if;
  if p_ticket_id is null or p_wallet_id is null then
    raise exception 'Conversation not found';
  end if;

  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;

  -- Terminal: an ended conversation cannot be revived by sending into it.
  if v_t.status = 'closed' then
    raise exception 'This conversation has ended. Start a new chat to talk to support again.';
  end if;

  insert into public.support_messages (ticket_id, sender, body)
  values (p_ticket_id, 'user', left(trim(p_body), 2000));

  update public.support_tickets
  set last_message_at = now(),
      user_last_seen_at = now(),
      unread_for_admin = unread_for_admin + 1
  where id = p_ticket_id
  returning * into v_t;

  return to_jsonb(v_t);
end;
$$;

-- ------------------------------------------------------------
-- 5. Admin end-chat records WHICH agent ended it (for ratings)
--    Signature changes, so drop the old 2-argument version first.
-- ------------------------------------------------------------
drop function if exists public.rpc_support_admin_close(text, uuid);

create or replace function public.rpc_support_admin_close(
  p_admin_key text default null,
  p_ticket_id uuid default null,
  p_admin_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_t public.support_tickets%rowtype;
begin
  if not public.rpc_admin_authorized(p_admin_key) then
    raise exception 'Unauthorized';
  end if;
  if p_ticket_id is null then
    raise exception 'Ticket id required';
  end if;

  update public.support_tickets
  set status = 'closed',
      closed_by = 'admin',
      closed_at = now(),
      admin_name = coalesce(nullif(trim(coalesce(p_admin_name, '')), ''), admin_name)
  where id = p_ticket_id
  returning * into v_t;

  return jsonb_build_object('success', true, 'ticket', to_jsonb(v_t), 'admin_name', v_t.admin_name);
end;
$$;

-- ------------------------------------------------------------
-- 6. Support ratings + comments, per customer-service agent
--    Powers the new admin "Chat Ratings" section.
-- ------------------------------------------------------------
create or replace function public.rpc_support_admin_ratings(p_admin_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows jsonb;
  v_by_admin jsonb;
begin
  if not public.rpc_admin_authorized(p_admin_key) then
    raise exception 'Unauthorized';
  end if;

  -- Every rated conversation, newest first.
  select coalesce(jsonb_agg(jsonb_build_object(
    'ticket_id', t.id,
    'admin_name', coalesce(nullif(t.admin_name, ''), 'Unassigned'),
    'rating', t.rating,
    'rating_comment', t.rating_comment,
    'closed_by', t.closed_by,
    'closed_at', t.closed_at,
    'subject', t.subject,
    'user_name', t.name,
    'user_email', t.email,
    'wallet_id', t.wallet_id,
    'address', w.address
  ) order by t.closed_at desc nulls last), '[]'::jsonb)
  into v_rows
  from public.support_tickets t
  left join public.wallets w on w.id = t.wallet_id
  where t.rating is not null;

  -- Performance summary grouped by the agent who handled the chat.
  select coalesce(jsonb_agg(jsonb_build_object(
    'admin_name', s.admin_name,
    'ratings', s.ratings,
    'average', round(s.avg_rating, 2),
    'five_star', s.five_star,
    'with_comment', s.with_comment
  ) order by s.avg_rating desc, s.ratings desc), '[]'::jsonb)
  into v_by_admin
  from (
    select
      coalesce(nullif(t.admin_name, ''), 'Unassigned') as admin_name,
      count(*)::int as ratings,
      avg(t.rating)::numeric as avg_rating,
      count(*) filter (where t.rating = 5)::int as five_star,
      count(nullif(trim(coalesce(t.rating_comment, '')), ''))::int as with_comment
    from public.support_tickets t
    where t.rating is not null
    group by 1
  ) s;

  return jsonb_build_object('ratings', v_rows, 'by_admin', v_by_admin);
end;
$$;

-- ------------------------------------------------------------
-- 7. Grants for the (re)defined functions
-- ------------------------------------------------------------
grant execute on function public.rpc_support_reopen(uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_support_send(uuid, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_admin_reopen(text, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_reply(text, uuid, text, text) to anon, authenticated;
grant execute on function public.rpc_support_admin_close(text, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_admin_ratings(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. Make PostgREST pick up the changes immediately
-- ------------------------------------------------------------
notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Verification: every mining claim that failed is still claimable
-- ------------------------------------------------------------
-- select wallet_id, status, end_time, credited_hours, reward_amount
-- from public.mining_sessions where status = 'mining' order by end_time;
--
-- After the fix each of those can be claimed by its owner and will insert
-- a transactions row with currency 'Coopoints'.

