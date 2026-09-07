-- ==========================================================
-- COOP MOBILE WALLET - SUPABASE DATABASE SCHEMA & RPC FUNCTIONS
-- ==========================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. WALLETS TABLE
create table if not exists public.wallets (
  id uuid primary key default uuid_generate_v4(),
  address text unique not null,
  private_key_hash text not null,
  coop_balance numeric(20, 4) not null default 0.0000,
  cooptoken_balance numeric(20, 4) not null default 0.0000,
  mining_power_level integer not null default 1,
  current_boost_pct integer not null default 0,
  total_boost_reward numeric(20, 4) not null default 0.0000,
  total_sent numeric(20, 4) not null default 0.0000,
  total_received numeric(20, 4) not null default 0.0000,
  pin_code text default '123456',
  biometrics_enabled boolean default true,
  notifications_enabled boolean default true,
  auto_lock_minutes integer default 5,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_active_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. MINING SESSIONS TABLE
create table if not exists public.mining_sessions (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  start_time timestamp with time zone default timezone('utc'::text, now()) not null,
  end_time timestamp with time zone not null,
  duration_hours integer not null default 12,
  base_reward numeric(20, 4) not null default 50.0000,
  boost_reward numeric(20, 4) not null default 0.0000,
  total_reward numeric(20, 4) not null default 50.0000,
  status text not null default 'mining' check (status in ('mining', 'ready_to_claim', 'claimed')),
  claimed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. BOOST PURCHASES TABLE
create table if not exists public.boost_purchases (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  tier_name text not null,
  cost_usd numeric(10, 2) not null,
  bonus_reward numeric(20, 4) not null,
  boost_pct integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. TASKS TABLE
create table if not exists public.tasks (
  id text primary key,
  title text not null,
  description text not null,
  category text not null default 'social' check (category in ('all', 'social', 'special')),
  reward_cooptoken numeric(20, 4) not null,
  action_url text,
  icon text not null default 'check'
);

-- Seed Initial Tasks
insert into public.tasks (id, title, description, category, reward_cooptoken, action_url, icon)
values
  ('task_x', 'Follow on X', 'Join our official X account for updates', 'social', 10.0000, 'https://x.com/coopcoin', 'twitter'),
  ('task_tg', 'Join Telegram', 'Join our official community group', 'social', 15.0000, 'https://t.me/coopcoin', 'send'),
  ('task_daily', 'Daily Login', 'Check in daily and earn free mining power', 'special', 5.0000, '', 'calendar'),
  ('task_video', 'Watch Video', 'Watch a short introductory guide to COOP', 'special', 15.0000, 'https://youtube.com', 'video'),
  ('task_invite', 'Invite Friends', 'Earn rewards for every referral joining COOP', 'special', 50.0000, '', 'users')
on conflict (id) do nothing;

-- 5. USER TASK STATUS TABLE
create table if not exists public.user_tasks (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  task_id text references public.tasks(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'claimed')),
  completed_at timestamp with time zone,
  claimed_at timestamp with time zone,
  unique(wallet_id, task_id)
);

-- 6. TRANSACTIONS TABLE
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid references public.wallets(id) on delete cascade not null,
  tx_type text not null check (tx_type in ('send', 'receive', 'swap', 'mining', 'boost', 'task')),
  amount numeric(20, 4) not null,
  currency text not null check (currency in ('COOP', 'Cooptoken')),
  counterparty text,
  fee numeric(20, 4) default 0.0000,
  status text not null default 'Complete' check (status in ('Complete', 'Pending', 'Failed')),
  tx_hash text not null,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Row Level Security (RLS)
alter table public.wallets enable row level security;
alter table public.mining_sessions enable row level security;
alter table public.boost_purchases enable row level security;
alter table public.tasks enable row level security;
alter table public.user_tasks enable row level security;
alter table public.transactions enable row level security;

create policy "Public read tasks" on public.tasks for select using (true);
create policy "Allow all on wallets for demo" on public.wallets for all using (true);
create policy "Allow all on mining_sessions" on public.mining_sessions for all using (true);
create policy "Allow all on boost_purchases" on public.boost_purchases for all using (true);
create policy "Allow all on user_tasks" on public.user_tasks for all using (true);
create policy "Allow all on transactions" on public.transactions for all using (true);

-- ==========================================================
-- SERVER-SIDE RPC STORED PROCEDURES (ATOMIC & VALIDATED)
-- ==========================================================

-- A. Register or Login by Private Key
create or replace function public.rpc_authenticate_wallet(
  p_private_key text,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_key_hash text;
  v_wallet public.wallets%rowtype;
  v_new_address text;
begin
  -- Simple deterministic sha256 hash
  v_key_hash := encode(digest(p_private_key, 'sha256'), 'hex');

  select * into v_wallet from public.wallets where private_key_hash = v_key_hash limit 1;

  if found then
    update public.wallets set last_active_at = now() where id = v_wallet.id;
    return to_jsonb(v_wallet);
  end if;

  -- If not found and address provided, create new account with default welcome balances
  if p_address is not null then
    v_new_address := p_address;
  else
    v_new_address := '0x' || substring(v_key_hash from 1 for 40);
  end if;

  insert into public.wallets (
    address,
    private_key_hash,
    coop_balance,
    cooptoken_balance,
    mining_power_level,
    current_boost_pct,
    total_boost_reward,
    total_sent,
    total_received
  ) values (
    v_new_address,
    v_key_hash,
    1234.5600, -- Initial demo starting balance matching mockup ($245.68)
    250.0000,  -- Initial Cooptoken mining balance
    1,
    15,        -- 15% current boost
    0.0000,
    542.1200,
    1876.4500
  ) returning * into v_wallet;

  -- Create initial active mining session (12 hours)
  insert into public.mining_sessions (
    wallet_id,
    start_time,
    end_time,
    duration_hours,
    base_reward,
    boost_reward,
    total_reward,
    status
  ) values (
    v_wallet.id,
    now(),
    now() + interval '12 hours',
    12,
    50.0000,
    8.3200,
    58.3200,
    'mining'
  );

  return to_jsonb(v_wallet);
end;
$$;

-- B. Start Mining Session
create or replace function public.rpc_start_mining(
  p_wallet_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_wallet public.wallets%rowtype;
  v_existing public.mining_sessions%rowtype;
  v_session public.mining_sessions%rowtype;
  v_boost_bonus numeric(20, 4) := 0;
begin
  select * into v_wallet from public.wallets where id = p_wallet_id;
  if not found then
    raise exception 'Wallet not found';
  end if;

  -- Check if already active
  select * into v_existing from public.mining_sessions 
  where wallet_id = p_wallet_id and status in ('mining', 'ready_to_claim') 
  order by created_at desc limit 1;

  if found and v_existing.status = 'mining' and v_existing.end_time > now() then
    return to_jsonb(v_existing);
  end if;

  v_boost_bonus := (50.0000 * v_wallet.current_boost_pct / 100.0) + v_wallet.total_boost_reward;

  insert into public.mining_sessions (
    wallet_id,
    start_time,
    end_time,
    duration_hours,
    base_reward,
    boost_reward,
    total_reward,
    status
  ) values (
    p_wallet_id,
    now(),
    now() + interval '12 hours',
    12,
    50.0000,
    v_boost_bonus,
    50.0000 + v_boost_bonus,
    'mining'
  ) returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

-- C. Claim Mining Reward
create or replace function public.rpc_claim_mining_reward(
  p_wallet_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_session public.mining_sessions%rowtype;
  v_wallet public.wallets%rowtype;
  v_tx_hash text;
begin
  select * into v_session from public.mining_sessions 
  where id = p_session_id and wallet_id = p_wallet_id;

  if not found then
    raise exception 'Mining session not found';
  end if;

  if v_session.status = 'claimed' then
    raise exception 'Mining reward already claimed';
  end if;

  -- Mark claimed
  update public.mining_sessions
  set status = 'claimed', claimed_at = now()
  where id = v_session.id;

  -- Credit Cooptoken to wallet server-side
  update public.wallets
  set cooptoken_balance = cooptoken_balance + v_session.total_reward
  where id = p_wallet_id
  returning * into v_wallet;

  -- Record transaction
  v_tx_hash := '0x' || md5(random()::text || clock_timestamp()::text);
  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id,
    'mining',
    v_session.total_reward,
    'Cooptoken',
    'Mining Pool',
    0,
    'Complete',
    v_tx_hash,
    '12-hour session mining payout'
  );

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'reward_claimed', v_session.total_reward
  );
end;
$$;

-- D. Server-side Swap (1,000 Cooptoken = 1.000 COOP)
create or replace function public.rpc_execute_swap(
  p_wallet_id uuid,
  p_cooptoken_amount numeric
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_wallet public.wallets%rowtype;
  v_coop_received numeric(20, 4);
  v_tx_hash text;
begin
  if p_cooptoken_amount < 1000 then
    raise exception 'Minimum swap amount is 1,000 Cooptoken';
  end if;

  select * into v_wallet from public.wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'Wallet not found';
  end if;

  if v_wallet.cooptoken_balance < p_cooptoken_amount then
    raise exception 'Insufficient Cooptoken balance for swap';
  end if;

  -- Calculate exact 1000 : 1 conversion
  v_coop_received := round(p_cooptoken_amount / 1000.0, 4);

  -- Execute balance adjustments atomically
  update public.wallets
  set cooptoken_balance = cooptoken_balance - p_cooptoken_amount,
      coop_balance = coop_balance + v_coop_received
  where id = p_wallet_id
  returning * into v_wallet;

  v_tx_hash := '0x' || md5(random()::text || clock_timestamp()::text);

  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id,
    'swap',
    v_coop_received,
    'COOP',
    'Coop Swap DEX',
    0.0,
    'Complete',
    v_tx_hash,
    'Swapped ' || p_cooptoken_amount::text || ' Cooptoken to ' || v_coop_received::text || ' COOP'
  );

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'coop_received', v_coop_received,
    'tx_hash', v_tx_hash
  );
end;
$$;

-- E. Server-side Send COOP
create or replace function public.rpc_execute_send(
  p_wallet_id uuid,
  p_recipient text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_wallet public.wallets%rowtype;
  v_recipient_wallet public.wallets%rowtype;
  v_fee numeric(20, 4) := 0.0200;
  v_total_deduct numeric(20, 4);
  v_tx_hash text;
begin
  if p_amount <= 0 then
    raise exception 'Send amount must be greater than zero';
  end if;

  v_total_deduct := p_amount + v_fee;

  select * into v_wallet from public.wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'Sender wallet not found';
  end if;

  if v_wallet.coop_balance < v_total_deduct then
    raise exception 'Insufficient COOP balance (including 0.02 network fee)';
  end if;

  -- Deduct from sender
  update public.wallets
  set coop_balance = coop_balance - v_total_deduct,
      total_sent = total_sent + p_amount
  where id = p_wallet_id
  returning * into v_wallet;

  v_tx_hash := '0x' || md5(random()::text || clock_timestamp()::text);

  -- Record sender transaction
  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id,
    'send',
    p_amount,
    'COOP',
    p_recipient,
    v_fee,
    'Complete',
    v_tx_hash,
    'Sent ' || p_amount::text || ' COOP to ' || p_recipient
  );

  -- If recipient is an internal wallet, credit them
  select * into v_recipient_wallet from public.wallets where address = p_recipient for update;
  if found then
    update public.wallets
    set coop_balance = coop_balance + p_amount,
        total_received = total_received + p_amount
    where id = v_recipient_wallet.id;

    insert into public.transactions (
      wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
    ) values (
      v_recipient_wallet.id,
      'receive',
      p_amount,
      'COOP',
      v_wallet.address,
      0,
      'Complete',
      v_tx_hash,
      'Received ' || p_amount::text || ' COOP from ' || v_wallet.address
    );
  end if;

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'tx_hash', v_tx_hash
  );
end;
$$;

-- F. Server-side Boost Purchase
create or replace function public.rpc_purchase_boost(
  p_wallet_id uuid,
  p_tier_name text,
  p_cost_usd numeric,
  p_bonus_reward numeric,
  p_boost_pct integer
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_wallet public.wallets%rowtype;
  v_tx_hash text;
begin
  select * into v_wallet from public.wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'Wallet not found';
  end if;

  -- Record boost purchase
  insert into public.boost_purchases (
    wallet_id, tier_name, cost_usd, bonus_reward, boost_pct
  ) values (
    p_wallet_id, p_tier_name, p_cost_usd, p_bonus_reward, p_boost_pct
  );

  -- Increment user boost
  update public.wallets
  set current_boost_pct = current_boost_pct + p_boost_pct,
      total_boost_reward = total_boost_reward + p_bonus_reward,
      mining_power_level = mining_power_level + 1
  where id = p_wallet_id
  returning * into v_wallet;

  v_tx_hash := '0x' || md5(random()::text || clock_timestamp()::text);

  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id,
    'boost',
    p_bonus_reward,
    'Cooptoken',
    'COOP Mining Boost',
    0,
    'Complete',
    v_tx_hash,
    'Purchased ' || p_tier_name || ' (+' || p_bonus_reward::text || ' Mining Boost)'
  );

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'tx_hash', v_tx_hash
  );
end;
$$;

-- G. Server-side Task Completion & Reward
create or replace function public.rpc_claim_task_reward(
  p_wallet_id uuid,
  p_task_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_task public.tasks%rowtype;
  v_user_task public.user_tasks%rowtype;
  v_wallet public.wallets%rowtype;
  v_tx_hash text;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  select * into v_user_task from public.user_tasks where wallet_id = p_wallet_id and task_id = p_task_id;

  if found and v_user_task.status = 'claimed' then
    raise exception 'Task already claimed';
  end if;

  -- Upsert status to claimed
  insert into public.user_tasks (wallet_id, task_id, status, completed_at, claimed_at)
  values (p_wallet_id, p_task_id, 'claimed', now(), now())
  on conflict (wallet_id, task_id)
  do update set status = 'claimed', claimed_at = now();

  -- Credit Cooptoken
  update public.wallets
  set cooptoken_balance = cooptoken_balance + v_task.reward_cooptoken
  where id = p_wallet_id
  returning * into v_wallet;

  v_tx_hash := '0x' || md5(random()::text || clock_timestamp()::text);

  insert into public.transactions (
    wallet_id, tx_type, amount, currency, counterparty, fee, status, tx_hash, notes
  ) values (
    p_wallet_id,
    'task',
    v_task.reward_cooptoken,
    'Cooptoken',
    v_task.title,
    0,
    'Complete',
    v_tx_hash,
    'Completed task: ' || v_task.title
  );

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'task_reward', v_task.reward_cooptoken
  );
end;
$$;
