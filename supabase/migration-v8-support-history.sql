-- ============================================================
-- MIGRATION v8 - Support chat history, end-chat, ratings, admin name
-- Run this in the Supabase SQL Editor. Idempotent (safe to re-run).
--
-- REQUIRED for these app features (verified missing on the live DB):
--   * user chat history list             -> rpc_support_my_tickets
--   * end chat + 1-5 star rating         -> rpc_support_end / rpc_support_rate
--   * reopen / continue a conversation   -> rpc_support_reopen
--   * delete a conversation from history -> rpc_support_delete
--   * admin reply signed with a name     -> rpc_support_admin_reply(p_admin_name)
--   * admin reopen                       -> rpc_support_admin_reopen
--
-- Admin name: public/admin.html prompts for a name and sends p_admin_name.
-- It is stored on the ticket and returned by both polls, so the user always
-- sees who answered them.
-- ============================================================

-- ---------- 1. Columns on support_tickets ----------
alter table public.support_tickets
  add column if not exists closed_by text,
  add column if not exists closed_at timestamptz,
  add column if not exists rating smallint,
  add column if not exists rating_comment text,
  add column if not exists user_typing_at timestamptz,
  add column if not exists admin_typing_at timestamptz,
  add column if not exists admin_name text;

-- Rating range is added separately so re-running never trips on the
-- constraint already existing.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.support_tickets'::regclass
      and conname = 'support_tickets_rating_check'
  ) then
    alter table public.support_tickets
      add constraint support_tickets_rating_check
      check (rating is null or (rating between 1 and 5));
  end if;
end;
$$;

-- ---------- 2. Admin identity helper ----------
create or replace function public.rpc_admin_identity()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    'unknown'
  );
end;
$$;

grant execute on function public.rpc_admin_identity() to anon, authenticated;

-- ---------- 3. Send a message (blocked once the chat has ended) ----------
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
  if v_t.status = 'closed' then
    raise exception 'This conversation has ended. Tap Continue conversation to reopen it.';
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

-- ---------- 4. End the chat (optional 1-5 rating + comment) ----------
create or replace function public.rpc_support_end(
  p_ticket_id uuid,
  p_wallet_id uuid,
  p_rating integer default null,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_t public.support_tickets%rowtype;
begin
  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'Rating must be between 1 and 5';
  end if;

  update public.support_tickets
  set status = 'closed',
      closed_by = 'user',
      closed_at = now(),
      -- Keep an existing rating/comment if this call does not supply new ones.
      rating = coalesce(p_rating::smallint, rating),
      rating_comment = coalesce(nullif(trim(coalesce(p_comment, '')), ''), rating_comment)
  where id = p_ticket_id
  returning * into v_t;

  return to_jsonb(v_t);
end;
$$;

-- ---------- 5. Rate an already ended chat ----------
create or replace function public.rpc_support_rate(
  p_ticket_id uuid,
  p_wallet_id uuid,
  p_rating integer,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_t public.support_tickets%rowtype;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;

  update public.support_tickets
  set rating = p_rating::smallint,
      rating_comment = nullif(trim(coalesce(p_comment, '')), '')
  where id = p_ticket_id
  returning * into v_t;

  return to_jsonb(v_t);
end;
$$;

-- ---------- 6. Reopen (continue) a closed conversation ----------
create or replace function public.rpc_support_reopen(p_ticket_id uuid, p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_t public.support_tickets%rowtype;
begin
  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;

  update public.support_tickets
  set status = 'open',
      closed_by = null,
      closed_at = null,
      last_message_at = now()
  where id = p_ticket_id
  returning * into v_t;

  return to_jsonb(v_t);
end;
$$;

-- ---------- 7. Permanently delete a conversation (messages cascade) ----------
create or replace function public.rpc_support_delete(p_ticket_id uuid, p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  delete from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id
  returning id into v_id;

  if v_id is null then
    raise exception 'Conversation not found';
  end if;

  return jsonb_build_object('success', true, 'deleted', v_id);
end;
$$;

-- ---------- 8. Chat history list (newest first) ----------
create or replace function public.rpc_support_my_tickets(p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_rows jsonb;
begin
  if p_wallet_id is null then
    raise exception 'Wallet id required';
  end if;

  select coalesce(jsonb_agg(entry order by sort_key desc nulls last), '[]'::jsonb)
  into v_rows
  from (
    select
      t.last_message_at as sort_key,
      jsonb_build_object(
        'id', t.id,
        'subject', t.subject,
        'status', t.status,
        'last_message_at', t.last_message_at,
        'unread_for_user', t.unread_for_user,
        'closed_by', t.closed_by,
        'closed_at', t.closed_at,
        'rating', t.rating,
        'rating_comment', t.rating_comment,
        'admin_name', t.admin_name,
        'created_at', t.created_at,
        'preview', (
          select m.body from public.support_messages m
          where m.ticket_id = t.id
          order by m.created_at desc
          limit 1
        ),
        'message_count', (
          select count(*)::int from public.support_messages m
          where m.ticket_id = t.id
        )
      ) as entry
    from public.support_tickets t
    where t.wallet_id = p_wallet_id
  ) s;

  return v_rows;
end;
$$;

-- ---------- 9. User poll: messages + presence + typing + ended state ----------
create or replace function public.rpc_support_poll(p_ticket_id uuid, p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_t public.support_tickets%rowtype;
  v_admin_online boolean;
  v_admin_typing boolean;
begin
  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;

  -- The user is looking at the thread right now.
  update public.support_tickets
  set user_last_seen_at = now(), unread_for_user = 0
  where id = p_ticket_id;

  v_admin_online := v_t.admin_last_seen_at is not null
    and v_t.admin_last_seen_at > now() - interval '90 seconds';
  v_admin_typing := v_t.admin_typing_at is not null
    and v_t.admin_typing_at > now() - interval '90 seconds';

  return jsonb_build_object(
    'ticket', to_jsonb(v_t),
    'admin_name', v_t.admin_name,
    'admin_online', v_admin_online,
    'admin_typing', v_admin_typing,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'sender', m.sender,
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at)
      from public.support_messages m
      where m.ticket_id = p_ticket_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------- 10. Typing signal (user side, or authenticated admin) ----------
create or replace function public.rpc_support_typing(
  p_ticket_id uuid,
  p_wallet_id uuid default null,
  p_admin_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_ticket_id is null then
    raise exception 'Ticket id required';
  end if;

  if p_admin_key is not null then
    if not public.rpc_admin_authorized(p_admin_key) then
      raise exception 'Unauthorized';
    end if;
    update public.support_tickets
    set admin_typing_at = now()
    where id = p_ticket_id;
  else
    if p_wallet_id is null then
      raise exception 'Wallet id required';
    end if;
    update public.support_tickets
    set user_typing_at = now()
    where id = p_ticket_id and wallet_id = p_wallet_id;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

-- ---------- 11. Admin: ticket list ----------
create or replace function public.rpc_support_admin_list(p_admin_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.rpc_admin_authorized(p_admin_key) then
    raise exception 'Unauthorized';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'wallet_id', t.wallet_id,
      'address', w.address,
      'name', t.name,
      'email', t.email,
      'subject', t.subject,
      'status', t.status,
      'last_message_at', t.last_message_at,
      'unread_for_admin', t.unread_for_admin,
      'closed_by', t.closed_by,
      'closed_at', t.closed_at,
      'rating', t.rating,
      'rating_comment', t.rating_comment,
      'admin_name', t.admin_name,
      'user_online', t.user_last_seen_at > now() - interval '90 seconds',
      'preview', (
        select m.body from public.support_messages m
        where m.ticket_id = t.id
        order by m.created_at desc
        limit 1
      )
    ) order by t.last_message_at desc nulls last)
    from public.support_tickets t
    left join public.wallets w on w.id = t.wallet_id
  ), '[]'::jsonb);
end;
$$;

-- ---------- 12. Admin: poll one conversation ----------
create or replace function public.rpc_support_admin_poll(
  p_admin_key text default null,
  p_ticket_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_t public.support_tickets%rowtype;
  v_user_online boolean;
  v_user_typing boolean;
begin
  if not public.rpc_admin_authorized(p_admin_key) then
    raise exception 'Unauthorized';
  end if;
  if p_ticket_id is null then
    raise exception 'Ticket id required';
  end if;

  select * into v_t from public.support_tickets where id = p_ticket_id;
  if not found then raise exception 'Ticket not found'; end if;

  -- The admin is looking at this thread right now.
  update public.support_tickets
  set admin_last_seen_at = now(), unread_for_admin = 0
  where id = p_ticket_id;

  v_user_online := v_t.user_last_seen_at is not null
    and v_t.user_last_seen_at > now() - interval '90 seconds';
  v_user_typing := v_t.user_typing_at is not null
    and v_t.user_typing_at > now() - interval '90 seconds';

  return jsonb_build_object(
    'ticket', to_jsonb(v_t),
    'user_online', v_user_online,
    'user_typing', v_user_typing,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'sender', m.sender,
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at)
      from public.support_messages m
      where m.ticket_id = p_ticket_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------- 13. Admin: reply, signed with the admin's name ----------
-- The old 3-argument version would otherwise remain as an ambiguous overload.
drop function if exists public.rpc_support_admin_reply(text, uuid, text);

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

  insert into public.support_messages (ticket_id, sender, body)
  values (p_ticket_id, 'admin', left(trim(p_body), 2000));

  -- Replying always revives the thread, and remembers who answered.
  update public.support_tickets
  set last_message_at = now(),
      unread_for_user = unread_for_user + 1,
      status = 'open',
      closed_by = null,
      closed_at = null,
      admin_name = coalesce(nullif(trim(coalesce(p_admin_name, '')), ''), admin_name)
  where id = p_ticket_id
  returning * into v_t;

  return jsonb_build_object('success', true, 'ticket', to_jsonb(v_t), 'admin_name', v_t.admin_name);
end;
$$;

-- ---------- 14. Admin: end / reopen ----------
create or replace function public.rpc_support_admin_close(
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
  if p_ticket_id is null then
    raise exception 'Ticket id required';
  end if;

  update public.support_tickets
  set status = 'closed', closed_by = 'admin', closed_at = now()
  where id = p_ticket_id;

  return jsonb_build_object('success', true);
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
  if p_ticket_id is null then
    raise exception 'Ticket id required';
  end if;

  update public.support_tickets
  set status = 'open', closed_by = null, closed_at = null
  where id = p_ticket_id;

  return jsonb_build_object('success', true);
end;
$$;

-- ---------- 15. Support tables stay RPC-only (RLS on, no policies) ----------
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- ---------- 16. Grants ----------
grant execute on function public.rpc_admin_identity() to anon, authenticated;
grant execute on function public.rpc_support_send(uuid, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_end(uuid, uuid, integer, text) to anon, authenticated;
grant execute on function public.rpc_support_rate(uuid, uuid, integer, text) to anon, authenticated;
grant execute on function public.rpc_support_reopen(uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_support_delete(uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_support_my_tickets(uuid) to anon, authenticated;
grant execute on function public.rpc_support_poll(uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_support_typing(uuid, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_admin_list(text) to anon, authenticated;
grant execute on function public.rpc_support_admin_poll(text, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_reply(text, uuid, text, text) to anon, authenticated;
grant execute on function public.rpc_support_admin_close(text, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_reopen(text, uuid) to anon, authenticated;

-- ---------- 17. Make PostgREST see the new functions immediately ----------
notify pgrst, 'reload schema';

-- ---------- Verification (run separately to confirm) ----------
-- select p.proname, pg_get_function_arguments(p.oid) as args
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname like 'rpc_support%'
-- order by p.proname;

