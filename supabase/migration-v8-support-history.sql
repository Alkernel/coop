-- ============================================================
-- MIGRATION v8 - Support chat history + end-chat + ratings
-- Run this in Supabase SQL Editor. Idempotent (safe to re-run).
--
-- Adds:
--  1. closed_by / closed_at / rating / rating_comment on support_tickets
--  2. user_typing_at / admin_typing_at for both-side typing indicators
--  3. User: end chat (with optional 1-5 rating), rate an ended chat,
--     reopen a closed chat (keeps history, no name/email re-entry),
--     list chat history, delete a conversation from history.
--  4. Admin: "End chat" records closed_by='admin'+timestamp; reopen;
--     reply auto-reopens; ticket list exposes rating.
--  5. Re-defines user + admin polls so both sides see ended state,
--     rating, and typing flags live.
-- ============================================================

-- ---------- 1. Extra columns on support_tickets ----------

alter table public.support_tickets
  add column if not exists closed_by text,
  add column if not exists closed_at timestamptz,
  add column if not exists rating smallint check (rating between 1 and 5),
  add column if not exists rating_comment text,
  add column if not exists user_typing_at timestamptz,
  add column if not exists admin_typing_at timestamptz;

-- ---------- 2. Helper: who is the authenticated admin? ----------

create or replace function public.rpc_admin_identity()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.admin_users a where a.email = current_setting('request.jwt.claims', true)::jsonb ->> 'email') then
    return current_setting('request.jwt.claims', true)::jsonb ->> 'email';
  end if;
  return coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email', 'unknown');
end;
$$;

grant execute on function public.rpc_admin_identity() to anon, authenticated;

-- ---------- 3. User sends a message (blocked when chat is ended) ----------

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
  if v_t.status = 'closed' then
    raise exception 'This conversation has ended. Tap Continue conversation to reopen it.';
  end if;

  insert into public.support_messages (ticket_id, sender, body)
  values (p_ticket_id, 'user', left(trim(p_body), 2000));

  update public.support_tickets
  set last_message_at = now(), user_last_seen_at = now(), unread_for_admin = unread_for_admin + 1
  where id = p_ticket_id returning * into v_t;

  return to_jsonb(v_t);
end;
$$;


-- ---------- 4. User ends the chat (optional 1-5 rating + comment) ----------

create or replace function public.rpc_support_end(
  p_ticket_id uuid, p_wallet_id uuid, p_rating smallint default null, p_comment text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare v_t public.support_tickets%rowtype;
begin
  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;
  if v_t.status = 'closed' then raise exception 'This conversation has already ended'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'Rating must be between 1 and 5';
  end if;

  update public.support_tickets
  set status = 'closed', closed_by = 'user', closed_at = now(),
      rating = coalesce(p_rating, rating),
      rating_comment = coalesce(p_comment, rating_comment)
  where id = p_ticket_id returning * into v_t;

  return to_jsonb(v_t);
end;
$$;

-- ---------- 5. User rates a conversation ended by admin ----------

create or replace function public.rpc_support_rate(
  p_ticket_id uuid, p_wallet_id uuid, p_rating smallint, p_comment text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare v_t public.support_tickets%rowtype;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;
  if v_t.status <> 'closed' then
    raise exception 'Only ended conversations can be rated';
  end if;

  update public.support_tickets
  set rating = p_rating,
      rating_comment = coalesce(p_comment, rating_comment)
  where id = p_ticket_id returning * into v_t;

  return to_jsonb(v_t);
end;
$$;

-- ---------- 6. User continues a closed conversation (keeps history) ----------

create or replace function public.rpc_support_reopen(p_ticket_id uuid, p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare v_t public.support_tickets%rowtype;
begin
  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;

  update public.support_tickets
  set status = 'open', closed_by = null, closed_at = null, last_message_at = now()
  where id = p_ticket_id returning * into v_t;

  return to_jsonb(v_t);
end;
$$;

-- ---------- 7. User permanently deletes a conversation from history ----------

create or replace function public.rpc_support_delete(p_ticket_id uuid, p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare v_t public.support_tickets%rowtype;
begin
  delete from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id
  returning * into v_t;
  if not found then raise exception 'Conversation not found'; end if;
  return jsonb_build_object('success', true);
end;
$$;



-- ---------- 8. User chat history list (latest first) ----------

create or replace function public.rpc_support_my_tickets(p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'subject', t.subject, 'status', t.status,
    'last_message_at', t.last_message_at, 'unread_for_user', t.unread_for_user,
    'closed_by', t.closed_by, 'closed_at', t.closed_at,
    'rating', t.rating,
    'preview', (select m.body from public.support_messages m
                where m.ticket_id = t.id order by m.created_at desc limit 1),
    'message_count', (select count(*)::int from public.support_messages m
                      where m.ticket_id = t.id)
  ) order by t.last_message_at desc nulls last), '[]'::jsonb) into v_rows
  from public.support_tickets t
  where t.wallet_id = p_wallet_id;
  return v_rows;
end;
$$;

-- ---------- 9. User-side poll: messages + presence + typing + ended state + rating ----------

create or replace function public.rpc_support_poll(p_ticket_id uuid, p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_t public.support_tickets%rowtype;
  v_admin_online boolean;
  v_admin_typing boolean;
begin
  select * into v_t from public.support_tickets
  where id = p_ticket_id and wallet_id = p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;

  update public.support_tickets
  set user_last_seen_at = now(), unread_for_user = 0
  where id = p_ticket_id;

  v_admin_online := v_t.admin_last_seen_at is not null
    and v_t.admin_last_seen_at > now() - interval '90 seconds';
  v_admin_typing := v_t.admin_typing_at is not null
    and v_t.admin_typing_at > now() - interval '90 seconds';

  return jsonb_build_object(
    'ticket', jsonb_build_object(
      'id', v_t.id,
      'wallet_id', v_t.wallet_id,
      'name', v_t.name,
      'email', v_t.email,
      'subject', v_t.subject,
      'status', v_t.status,
      'last_message_at', v_t.last_message_at,
      'user_last_seen_at', v_t.user_last_seen_at,
      'admin_last_seen_at', v_t.admin_last_seen_at,
      'unread_for_admin', v_t.unread_for_admin,
      'unread_for_user', v_t.unread_for_user,
      'closed_by', v_t.closed_by,
      'closed_at', v_t.closed_at,
      'rating', v_t.rating,
      'rating_comment', v_t.rating_comment,
      'created_at', v_t.created_at
    ),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at
      ) order by m.created_at)
      from public.support_messages m where m.ticket_id = p_ticket_id
    ), '[]'::jsonb),
    'admin_online', v_admin_online,
    'admin_typing', v_admin_typing
  );
end;
$$;

-- ---------- 10. Typing signal (both sides: user and admin) ----------

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
-- ---------- rpc_support_admin_poll ----------

create or replace function public.rpc_support_admin_poll(p_admin_key text default null, p_ticket_id uuid default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean; v_t public.support_tickets%rowtype; v_user_online boolean; v_user_typing boolean;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key); if not v_ok then raise exception 'Unauthorized'; end if;
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;
  select * into v_t from public.support_tickets where id=p_ticket_id; if not found then raise exception 'Ticket not found'; end if;
  update public.support_tickets set admin_last_seen_at=now(), unread_for_admin=0 where id=p_ticket_id;
  v_user_online := v_t.user_last_seen_at > now() - interval '90 seconds';
  v_user_typing := v_t.user_typing_at is not null and v_t.user_typing_at > now() - interval '90 seconds';
  return jsonb_build_object('ticket',to_jsonb(v_t),'user_online',v_user_online,'user_typing',v_user_typing,
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender',m.sender,'body',m.body,'created_at',m.created_at) order by m.created_at) from public.support_messages m where m.ticket_id=p_ticket_id), '[]'::jsonb)); end; $$;

-- ---------- rpc_support_admin_reply ----------

create or replace function public.rpc_support_admin_reply(p_admin_key text default null, p_ticket_id uuid default null, p_body text default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean; v_admin text;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key); if not v_ok then raise exception 'Unauthorized'; end if;
  if p_body is null or length(trim(p_body))=0 then raise exception 'Message cannot be empty'; end if;
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;
  if not exists (select 1 from public.support_tickets where id=p_ticket_id) then raise exception 'Ticket not found'; end if;
  insert into public.support_messages (ticket_id,sender,body) values (p_ticket_id,'admin',left(trim(p_body),2000));
  v_admin := public.rpc_admin_identity();
  update public.support_tickets set last_message_at=now(),admin_last_seen_at=now(),unread_for_admin=0,unread_for_user=unread_for_user+1,status='open',closed_by=null,closed_at=null where id=p_ticket_id;
-- ---------- 8. User chat history list (latest first) ----------
  return jsonb_build_object('success',true,'admin',v_admin); end; $$;


create or replace function public.rpc_support_my_tickets(p_wallet_id uuid)
-- ---------- rpc_support_admin_close ----------
returns jsonb language plpgsql security definer as $$

declare v_rows jsonb;
create or replace function public.rpc_support_admin_close(p_admin_key text default null, p_ticket_id uuid default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
declare v_ok boolean;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'subject',t.subject,'status',t.status,'last_message_at',t.last_message_at,'unread_for_user',t.unread_for_user,'closed_by',t.closed_by,'closed_at',t.closed_at,'rating',t.rating,'preview',(select m.body from public.support_messages m where m.ticket_id=t.id order by m.created_at desc limit 1),'message_count',(select count(*)::int from public.support_messages m where m.ticket_id=t.id)) order by t.last_message_at desc nulls last), '[]'::jsonb) into v_rows from public.support_tickets t where t.wallet_id=p_wallet_id;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key); if not v_ok then raise exception 'Unauthorized'; end if;
  return v_rows; end; $$;
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;

  update public.support_tickets set status='closed',closed_by='admin',closed_at=now() where id=p_ticket_id;
-- ---------- 9. User-side poll: messages + presence + typing + ended state + rating ----------
  return jsonb_build_object('success',true); end; $$;


create or replace function public.rpc_support_poll(p_ticket_id uuid, p_wallet_id uuid)
-- ---------- rpc_support_admin_reopen ----------
returns jsonb language plpgsql security definer as $$

declare v_t public.support_tickets%rowtype; v_admin_online boolean; v_admin_typing boolean;
create or replace function public.rpc_support_admin_reopen(p_admin_key text default null, p_ticket_id uuid default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
declare v_ok boolean;
  select * into v_t from public.support_tickets where id=p_ticket_id and wallet_id=p_wallet_id;
begin
  if not found then raise exception 'Conversation not found'; end if;
  v_ok := public.rpc_admin_authorized(p_admin_key); if not v_ok then raise exception 'Unauthorized'; end if;
  update public.support_tickets set user_last_seen_at=now(), unread_for_user=0 where id=p_ticket_id;
  v_admin_online := v_t.admin_last_seen_at is not null and v_t.admin_last_seen_at > now() - interval '90 seconds';
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;
  update public.support_tickets set status='open',closed_by=null,closed_at=null where id=p_ticket_id;
  v_admin_typing := v_t.admin_typing_at is not null and v_t.admin_typing_at > now() - interval '90 seconds';
  return jsonb_build_object('success',true); end; $$;
  return jsonb_build_object(

    'ticket', jsonb_build_object('id',v_t.id,'wallet_id',v_t.wallet_id,'name',v_t.name,'email',v_t.email,'subject',v_t.subject,'status',v_t.status,'last_message_at',v_t.last_message_at,'user_last_seen_at',v_t.user_last_seen_at,'admin_last_seen_at',v_t.admin_last_seen_at,'unread_for_admin',v_t.unread_for_admin,'unread_for_user',v_t.unread_for_user,'closed_by',v_t.closed_by,'closed_at',v_t.closed_at,'rating',v_t.rating,'rating_comment',v_t.rating_comment,'created_at',v_t.created_at),
-- ---------- rpc_support_admin_list ----------
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender',m.sender,'body',m.body,'created_at',m.created_at) order by m.created_at) from public.support_messages m where m.ticket_id=p_ticket_id), '[]'::jsonb),

    'admin_online', v_admin_online, 'admin_typing', v_admin_typing
create or replace function public.rpc_support_admin_list(p_admin_key text default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
  ); end; $$;
declare v_ok boolean;

begin
  v_ok := public.rpc_admin_authorized(p_admin_key); if not v_ok then raise exception 'Unauthorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'wallet_id',t.wallet_id,'address',w.address,'name',t.name,'email',t.email,'subject',t.subject,'status',t.status,'last_message_at',t.last_message_at,'unread_for_admin',t.unread_for_admin,'closed_by',t.closed_by,'closed_at',t.closed_at,'rating',t.rating,'rating_comment',t.rating_comment,'user_online',t.user_last_seen_at>now()-interval '90 seconds','preview',(select m.body from public.support_messages m where m.ticket_id=t.id order by m.created_at desc limit 1)) order by t.last_message_at desc nulls last) from public.support_tickets t left join public.wallets w on w.id=t.wallet_id), '[]'::jsonb); end; $$;

-- ---------- 16. Grants (all support RPCs, idempotent) ----------

grant execute on function public.rpc_support_send(uuid, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_end(uuid, uuid, smallint, text) to anon, authenticated;
grant execute on function public.rpc_support_rate(uuid, uuid, smallint, text) to anon, authenticated;
grant execute on function public.rpc_support_reopen(uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_support_delete(uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_support_my_tickets(uuid) to anon, authenticated;
grant execute on function public.rpc_support_poll(uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_support_typing(uuid, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_admin_poll(text, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_reply(text, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_admin_close(text, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_reopen(text, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_list(text) to anon, authenticated;

-- ---------- 8. User chat history list (latest first) ----------

create or replace function public.rpc_support_my_tickets(p_wallet_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'subject',t.subject,'status',t.status,'last_message_at',t.last_message_at,'unread_for_user',t.unread_for_user,'closed_by',t.closed_by,'closed_at',t.closed_at,'rating',t.rating,'preview',(select m.body from public.support_messages m where m.ticket_id=t.id order by m.created_at desc limit 1),'message_count',(select count(*)::int from public.support_messages m where m.ticket_id=t.id)) order by t.last_message_at desc nulls last), '[]'::jsonb) into v_rows from public.support_tickets t where t.wallet_id=p_wallet_id;
  return v_rows; end; $$;

-- ---------- 9. User-side poll: messages + presence + typing + ended state + rating ----------

create or replace function public.rpc_support_poll(p_ticket_id uuid, p_wallet_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_t public.support_tickets%rowtype; v_admin_online boolean; v_admin_typing boolean;
begin
  select * into v_t from public.support_tickets where id=p_ticket_id and wallet_id=p_wallet_id;
  if not found then raise exception 'Conversation not found'; end if;
  update public.support_tickets set user_last_seen_at=now(), unread_for_user=0 where id=p_ticket_id;
  v_admin_online := v_t.admin_last_seen_at is not null and v_t.admin_last_seen_at > now() - interval '90 seconds';
  v_admin_typing := v_t.admin_typing_at is not null and v_t.admin_typing_at > now() - interval '90 seconds';
  return jsonb_build_object(
    'ticket', jsonb_build_object('id',v_t.id,'wallet_id',v_t.wallet_id,'name',v_t.name,'email',v_t.email,'subject',v_t.subject,'status',v_t.status,'last_message_at',v_t.last_message_at,'user_last_seen_at',v_t.user_last_seen_at,'admin_last_seen_at',v_t.admin_last_seen_at,'unread_for_admin',v_t.unread_for_admin,'unread_for_user',v_t.unread_for_user,'closed_by',v_t.closed_by,'closed_at',v_t.closed_at,'rating',v_t.rating,'rating_comment',v_t.rating_comment,'created_at',v_t.created_at),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender',m.sender,'body',m.body,'created_at',m.created_at) order by m.created_at) from public.support_messages m where m.ticket_id=p_ticket_id), '[]'::jsonb),
    'admin_online', v_admin_online, 'admin_typing', v_admin_typing
  ); end; $$;

-- ---------- rpc_support_admin_poll ----------

create or replace function public.rpc_support_admin_poll(p_admin_key text default null, p_ticket_id uuid default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean; v_t public.support_tickets%rowtype; v_user_online boolean; v_user_typing boolean;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key); if not v_ok then raise exception 'Unauthorized'; end if;
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;
  select * into v_t from public.support_tickets where id=p_ticket_id; if not found then raise exception 'Ticket not found'; end if;
  update public.support_tickets set admin_last_seen_at=now(), unread_for_admin=0 where id=p_ticket_id;
  v_user_online := v_t.user_last_seen_at > now() - interval '90 seconds';
  v_user_typing := v_t.user_typing_at is not null and v_t.user_typing_at > now() - interval '90 seconds';
  return jsonb_build_object('ticket',to_jsonb(v_t),'user_online',v_user_online,'user_typing',v_user_typing,
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender',m.sender,'body',m.body,'created_at',m.created_at) order by m.created_at) from public.support_messages m where m.ticket_id=p_ticket_id), '[]'::jsonb)); end; $$;

-- ---------- rpc_support_admin_reply ----------

create or replace function public.rpc_support_admin_reply(p_admin_key text default null, p_ticket_id uuid default null, p_body text default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean; v_admin text;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key); if not v_ok then raise exception 'Unauthorized'; end if;
  if p_body is null or length(trim(p_body))=0 then raise exception 'Message cannot be empty'; end if;
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;
  if not exists (select 1 from public.support_tickets where id=p_ticket_id) then raise exception 'Ticket not found'; end if;
  insert into public.support_messages (ticket_id,sender,body) values (p_ticket_id,'admin',left(trim(p_body),2000));
  v_admin := public.rpc_admin_identity();
  update public.support_tickets set last_message_at=now(),admin_last_seen_at=now(),unread_for_admin=0,unread_for_user=unread_for_user+1,status='open',closed_by=null,closed_at=null where id=p_ticket_id;
  return jsonb_build_object('success',true,'admin',v_admin); end; $$;

-- ---------- rpc_support_admin_close ----------

create or replace function public.rpc_support_admin_close(p_admin_key text default null, p_ticket_id uuid default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key); if not v_ok then raise exception 'Unauthorized'; end if;
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;
  update public.support_tickets set status='closed',closed_by='admin',closed_at=now() where id=p_ticket_id;
  return jsonb_build_object('success',true); end; $$;

-- ---------- rpc_support_admin_reopen ----------

create or replace function public.rpc_support_admin_reopen(p_admin_key text default null, p_ticket_id uuid default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key); if not v_ok then raise exception 'Unauthorized'; end if;
  if p_ticket_id is null then raise exception 'Ticket id required'; end if;
  update public.support_tickets set status='open',closed_by=null,closed_at=null where id=p_ticket_id;
  return jsonb_build_object('success',true); end; $$;

-- ---------- rpc_support_admin_list ----------

create or replace function public.rpc_support_admin_list(p_admin_key text default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  v_ok := public.rpc_admin_authorized(p_admin_key); if not v_ok then raise exception 'Unauthorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'wallet_id',t.wallet_id,'address',w.address,'name',t.name,'email',t.email,'subject',t.subject,'status',t.status,'last_message_at',t.last_message_at,'unread_for_admin',t.unread_for_admin,'closed_by',t.closed_by,'closed_at',t.closed_at,'rating',t.rating,'rating_comment',t.rating_comment,'user_online',t.user_last_seen_at>now()-interval '90 seconds','preview',(select m.body from public.support_messages m where m.ticket_id=t.id order by m.created_at desc limit 1)) order by t.last_message_at desc nulls last) from public.support_tickets t left join public.wallets w on w.id=t.wallet_id), '[]'::jsonb); end; $$;

-- ---------- 16. Grants (all support RPCs, idempotent) ----------

grant execute on function public.rpc_support_send(uuid, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_end(uuid, uuid, smallint, text) to anon, authenticated;
grant execute on function public.rpc_support_rate(uuid, uuid, smallint, text) to anon, authenticated;
grant execute on function public.rpc_support_reopen(uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_support_delete(uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_support_my_tickets(uuid) to anon, authenticated;
grant execute on function public.rpc_support_poll(uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_support_typing(uuid, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_admin_poll(text, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_reply(text, uuid, text) to anon, authenticated;
grant execute on function public.rpc_support_admin_close(text, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_reopen(text, uuid) to anon, authenticated;
grant execute on function public.rpc_support_admin_list(text) to anon, authenticated;

