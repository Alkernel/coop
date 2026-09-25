-- Admin transaction overview. Keeps the existing admin authorization boundary.
-- This migration only adds real aggregate counts and address search to the RPC.
create or replace function public.rpc_admin_transactions(
  p_admin_key text default null, p_type text default 'all',
  p_search text default null, p_limit integer default 50, p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
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
      or t.counterparty ilike '%'||p_search||'%' or t.wallet_id::text ilike '%'||p_search||'%'
      or exists (select 1 from public.wallets w where w.id=t.wallet_id and w.address ilike '%'||p_search||'%'));
  return jsonb_build_object('total', v_total,
    'status_counts', jsonb_build_object(
      'pending', (select count(*) from public.transactions t
        where (p_type is null or p_type='all' or t.tx_type=p_type)
          and (p_search is null or p_search='' or t.tx_hash ilike '%'||p_search||'%'
            or t.counterparty ilike '%'||p_search||'%' or t.wallet_id::text ilike '%'||p_search||'%'
            or exists (select 1 from public.wallets w3 where w3.id=t.wallet_id and w3.address ilike '%'||p_search||'%'))
          and lower(coalesce(t.status,''))='pending'),
      'completed', (select count(*) from public.transactions t
        where (p_type is null or p_type='all' or t.tx_type=p_type)
          and (p_search is null or p_search='' or t.tx_hash ilike '%'||p_search||'%'
            or t.counterparty ilike '%'||p_search||'%' or t.wallet_id::text ilike '%'||p_search||'%'
            or exists (select 1 from public.wallets w3 where w3.id=t.wallet_id and w3.address ilike '%'||p_search||'%'))
          and lower(coalesce(t.status,'')) in ('complete','completed')),
      'failed', (select count(*) from public.transactions t
        where (p_type is null or p_type='all' or t.tx_type=p_type)
          and (p_search is null or p_search='' or t.tx_hash ilike '%'||p_search||'%'
            or t.counterparty ilike '%'||p_search||'%' or t.wallet_id::text ilike '%'||p_search||'%'
            or exists (select 1 from public.wallets w3 where w3.id=t.wallet_id and w3.address ilike '%'||p_search||'%'))
          and lower(coalesce(t.status,''))='failed')
    ), 'rows', coalesce((
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
            or t.counterparty ilike '%'||p_search||'%' or t.wallet_id::text ilike '%'||p_search||'%'
            or exists (select 1 from public.wallets w2 where w2.id=t.wallet_id and w2.address ilike '%'||p_search||'%'))
        order by t.created_at desc limit v_lim offset v_off
      ) t left join public.wallets w on w.id=t.wallet_id
    ), '[]'::jsonb));
end;
$$;

grant execute on function public.rpc_admin_transactions(text, text, text, integer, integer) to anon, authenticated;
