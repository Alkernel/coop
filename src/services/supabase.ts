import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { deriveAddressFromKey } from './crypto';
import {
  WalletAccount, MiningSession, MiningStatus, Transaction, TaskItem,
  AppSettings, BoostTier, SwapDirection
} from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Fallback boost tiers (UI display only until settings load;
// the server's admin_settings.boost_tiers is the source of truth)
export const DEFAULT_BOOST_TIERS: BoostTier[] = [
  { id: 'starter', name: 'Starter', priceUsd: 1.00, boostPct: 25, durationDays: 7 },
  { id: 'plus', name: 'Plus', priceUsd: 2.50, boostPct: 50, durationDays: 7 },
  { id: 'pro', name: 'Pro', priceUsd: 3.00, boostPct: 75, durationDays: 7 },
  { id: 'max', name: 'Max', priceUsd: 3.50, boostPct: 100, durationDays: 7 }
];

class DatabaseService {
  private assertSupabase(): SupabaseClient {
    if (!supabase) {
      throw new Error(
        'COOP Wallet requires a backend connection. Supabase is not configured â€” ' +
        'set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      );
    }
    return supabase;
  }

  // --- Row mappers (all values originate from the database) ---
  private walletFromDb(row: any, privateKey?: string): WalletAccount {
    return {
      id: row.id,
      address: row.address,
      privateKey: privateKey || '',
      coopBalance: Number(row.coop_balance),
      cooptokenBalance: Number(row.cooptoken_balance),
      totalSent: Number(row.total_sent ?? 0),
      totalReceived: Number(row.total_received ?? 0),
      pinCode: row.pin_code || '123456',
      biometricsEnabled: row.biometrics_enabled ?? true,
      notificationsEnabled: row.notifications_enabled ?? true,
      autoLockMinutes: row.auto_lock_minutes ?? 5,
      createdAt: row.created_at
    };
  }

  private sessionFromDb(row: any): MiningSession {
    return {
      id: row.id,
      walletId: row.wallet_id,
      startTime: new Date(row.start_time).getTime(),
      endTime: new Date(row.end_time).getTime(),
      baseRate: Number(row.base_rate),
      boostPct: Number(row.boost_pct ?? 0),
      status: row.status
    };
  }

  private txFromDb(row: any): Transaction {
    return {
      id: row.id,
      txType: row.tx_type,
      amount: Number(row.amount),
      currency: row.currency,
      pointsAmount: row.points_amount != null ? Number(row.points_amount) : undefined,
      direction: row.direction || undefined,
      counterparty: row.counterparty || '',
      fee: Number(row.fee ?? 0),
      status: row.status,
      txHash: row.tx_hash,
      notes: row.notes || undefined,
      timestamp: new Date(row.created_at).getTime()
    };
  }

  // --- 1. AUTHENTICATE / RESTORE WALLET (server only) ---
  async authenticate(privateKey: string, createIfNew: boolean = false): Promise<WalletAccount> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_authenticate_wallet', {
      p_private_key: privateKey,
      p_address: createIfNew ? deriveAddressFromKey(privateKey) : null
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Authentication failed');
    return this.walletFromDb(data, privateKey);
  }

  // --- 2. SETTINGS (server source of truth) ---
  async getSettings(): Promise<AppSettings> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_get_settings');
    if (error || !data) throw new Error(error?.message || 'Failed to load settings');
    return {
      baseMiningRate: Number(data.base_mining_rate),
      dailyMiningHours: Number(data.daily_mining_hours),
      pointsPerCoop: Number(data.points_per_coop),
      dailyConversionLimitPoints: Number(data.daily_conversion_limit_points),
      totalCoopRewardPool: Number(data.total_coop_reward_pool),
      remainingCoopRewardPool: Number(data.remaining_coop_reward_pool),
      miningEnabled: Boolean(data.mining_enabled),
      conversionEnabled: Boolean(data.conversion_enabled),
      boostPurchasesEnabled: Boolean(data.boost_purchases_enabled),
      boostsStackable: Boolean(data.boosts_stackable),
      swapRateLimitSeconds: Number(data.swap_rate_limit_seconds ?? 0),
      boostTiers: Array.isArray(data.boost_tiers) ? data.boost_tiers.map((t: any) => ({
        id: t.id,
        name: t.name,
        priceUsd: Number(t.priceUsd ?? t.price_usd ?? 0),
        boostPct: Number(t.boostPct ?? t.boost_pct ?? 0),
        durationDays: Number(t.durationDays ?? t.duration_days ?? 7)
      })) : DEFAULT_BOOST_TIERS
    };
  }

  async adminSetSettings(adminKey: string, updates: Record<string, any>): Promise<void> {
    const sb = this.assertSupabase();
    const { error } = await sb.rpc('rpc_admin_set_settings', {
      p_admin_key: adminKey,
      p_updates: updates
    });
    if (error) throw new Error(error.message);
  }

  // --- 3. MINING (server-side accrual; timers are display-only) ---
  async getMiningStatus(walletId: string): Promise<MiningStatus> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_mining_status', { p_wallet_id: walletId });
    if (error || !data) throw new Error(error?.message || 'Failed to load mining status');
    return {
      wallet: this.walletFromDb(data.wallet),
      session: data.session ? this.sessionFromDb(data.session) : null,
      rate: Number(data.rate),
      boostPct: Number(data.boost_pct),
      hoursMinedToday: Number(data.hours_mined_today),
      pointsEarnedToday: Number(data.points_earned_today),
      dailyHours: Number(data.daily_hours),
      dailyLimitPoints: Number(data.daily_limit_points),
      nextResetUtc: new Date(data.next_reset_utc).getTime(),
      miningEnabled: Boolean(data.mining_enabled)
    };
  }

  async startMining(walletId: string): Promise<MiningSession> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_start_mining', { p_wallet_id: walletId });
    if (error) throw new Error(error.message);
    return this.sessionFromDb(data);
  }

  async stopMining(wallet: WalletAccount): Promise<{ wallet: WalletAccount; reward: number }> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_stop_mining', { p_wallet_id: wallet.id });
    if (error) throw new Error(error.message);
    return {
      wallet: this.walletFromDb(data.wallet, wallet.privateKey),
      reward: Number(data.reward)
    };
  }

  // --- 4. BIDIRECTIONAL SWAP (atomic server-side execution) ---
  async executeSwap(
    wallet: WalletAccount,
    direction: SwapDirection,
    amount: number
  ): Promise<{ wallet: WalletAccount; points: number; coop: number; txHash: string }> {
    const sb = this.assertSupabase();
    // Per-request nonce: the server rejects any duplicate/replayed request
    const nonce = (globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${wallet.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const { data, error } = await sb.rpc('rpc_execute_swap', {
      p_wallet_id: wallet.id,
      p_direction: direction,
      p_amount: amount,
      p_client_nonce: nonce
    });
    if (error) throw new Error(error.message);
    return {
      wallet: this.walletFromDb(data.wallet, wallet.privateKey),
      points: Number(data.points),
      coop: Number(data.coop),
      txHash: String(data.tx_hash)
    };
  }

  // --- 5. SEND COOP (server-side) ---
  async executeSend(
    wallet: WalletAccount,
    recipient: string,
    amount: number
  ): Promise<{ wallet: WalletAccount; fee: number }> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_execute_send', {
      p_wallet_id: wallet.id,
      p_recipient: recipient,
      p_amount: amount
    });
    if (error) throw new Error(error.message);
    return {
      wallet: this.walletFromDb(data.wallet, wallet.privateKey),
      fee: 0.02
    };
  }

  // --- 6. TRANSACTIONS (real database records only) ---
  async getTransactions(walletId: string): Promise<Transaction[]> {
    const sb = this.assertSupabase();
    const { data, error } = await sb
      .from('transactions')
      .select('*')
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data || []).map((row: any) => this.txFromDb(row));
  }

  // --- 7. TASKS (server catalog + server-side claim) ---
  async getTasks(walletId: string): Promise<TaskItem[]> {
    const sb = this.assertSupabase();
    const { data: catalog, error } = await sb.from('tasks').select('*');
    if (error) throw new Error(error.message);
    const { data: userTasks } = await sb
      .from('user_tasks')
      .select('*')
      .eq('wallet_id', walletId);
    const statusById = new Map<string, string>(
      (userTasks || []).map((ut: any) => [ut.task_id, ut.status])
    );
    return (catalog || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      category: t.category === 'all' ? 'special' : t.category,
      rewardCooptoken: Number(t.reward_cooptoken),
      actionUrl: t.action_url || undefined,
      icon: t.icon === 'twitter' ? 'x' : t.icon,
      status: (statusById.get(t.id) === 'claimed' ? 'claimed' : 'pending') as TaskItem['status']
    }));
  }

  async claimTask(wallet: WalletAccount, taskId: string): Promise<{ wallet: WalletAccount; reward: number }> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_claim_task_reward', {
      p_wallet_id: wallet.id,
      p_task_id: taskId
    });
    if (error) throw new Error(error.message);
    return {
      wallet: this.walletFromDb(data.wallet, wallet.privateKey),
      reward: Number(data.task_reward ?? 0)
    };
  }
}

export const dbService = new DatabaseService();
