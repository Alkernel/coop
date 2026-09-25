import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { deriveAddressFromKey } from './crypto';
import {
  WalletAccount, MiningSession, MiningStatus, Transaction, TaskItem,
  AppSettings, BoostTier, SwapDirection
} from '../types';

// Env vars take precedence (for local .env.local or future Vercel config).
// Hardcoded fallbacks keep the free-plan Vercel deploy working without setup.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xkmnodecehgpnssdctvk.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable__Ddgj3Yzj7CHXWeBZFQ36g_XOW2sIAL';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Fallback boost tiers (UI display only until settings load;
// the server's admin_settings.boost_tiers is the source of truth)
export const DEFAULT_BOOST_TIERS: BoostTier[] = [
  { id: 'starter', name: 'Starter', priceUsd: 1.00, boostPct: 25, durationDays: 7 },
  { id: 'plus', name: 'Plus', priceUsd: 2.50, boostPct: 50, durationDays: 7 },
  { id: 'pro', name: 'Pro', priceUsd: 4.00, boostPct: 75, durationDays: 7 },
  { id: 'max', name: 'Max', priceUsd: 5.50, boostPct: 100, durationDays: 7 }
];

// ---------------------------------------------------------------------------
// Explorer types — read-only views over the REAL ledger rows in
// public.transactions. Nothing here invents data: every field maps 1:1 to a
// database column, and fields the backend cannot resolve yet stay null.
// ---------------------------------------------------------------------------

export type ExplorerStatusFilter = 'all' | 'completed' | 'pending' | 'failed';

export interface ExplorerTransaction {
  id: string;
  txType: string;
  amount: number;
  currency: string;
  pointsAmount: number;
  direction?: string;
  counterparty?: string;
  fee: number;
  status: string;
  txHash: string;
  notes?: string;
  memo?: string;
  timestamp: number;
  /** Owner wallet address — null until the ledger index RPC is deployed. */
  walletAddress: string | null;
}

export interface ExplorerStats {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  /** Distinct wallets in the ledger (null when it cannot be resolved). */
  wallets: number | null;
  /** true when the numbers come from the ledger index RPC. */
  indexed: boolean;
  /** Oldest / newest record timestamps (null when unknown). */
  firstTimestamp: number | null;
  lastTimestamp: number | null;
}

export interface ExplorerAddressActivity {
  address: string;
  rows: ExplorerTransaction[];
  /** true when the backend could resolve the address' own ledger rows too. */
  indexed: boolean;
  /** Total matching rows across all pages when the backend reports it. */
  total: number | null;
}

export type ExplorerLookup =
  | { kind: 'tx'; hash: string }
  | { kind: 'address'; address: string }
  | { kind: 'none' };

export const sanitizeExplorerQuery = (q: string): string =>
  (q || '').trim().replace(/[^a-zA-Z0-9x]/g, '');

// Columns the explorer reads from the ledger. Never includes secrets — the
// ledger table only holds ledger data.
const EXPLORER_TX_COLUMNS =
  'id,wallet_id,tx_type,amount,currency,points_amount,direction,counterparty,fee,status,tx_hash,notes,created_at';

export const looksLikeAddress = (q: string): boolean =>
  /^0x[0-9a-fA-F]{40}$/.test(sanitizeExplorerQuery(q));

export const isCompletedStatus = (status?: string | null): boolean => {
  const v = (status || '').trim().toLowerCase();
  return v === 'completed' || v === 'complete';
};

export const isPendingStatus = (status?: string | null): boolean =>
  (status || '').trim().toLowerCase() === 'pending';

export const isFailedStatus = (status?: string | null): boolean =>
  (status || '').trim().toLowerCase() === 'failed';

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
      pinCode: row.pin_code || '',
      biometricsEnabled: row.biometrics_enabled ?? true,
      notificationsEnabled: row.notifications_enabled ?? true,
      autoLockMinutes: row.auto_lock_minutes ?? 5,
      createdAt: row.created_at,
      status: (row.status ?? 'active') as WalletAccount['status'],
      restrictedReason: row.restricted_reason ?? null
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
    // Memos are stored in notes as " | Memo: <comment>" by rpc_execute_send.
    const notes: string | undefined = row.notes || undefined;
    let memo: string | undefined;
    if (notes) {
      const m = notes.match(/\| Memo: ([\s\S]+)$/);
      if (m) memo = m[1].trim();
    }
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
      notes,
      memo,
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

  // Claim the completed mining session. The server refuses to pay out until
  // the full 12h countdown has finished (no early stop-and-claim bypass).
  async claimMining(wallet: WalletAccount): Promise<{ wallet: WalletAccount; reward: number }> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_claim_mining', { p_wallet_id: wallet.id });
    if (error) throw new Error(error.message);
    return {
      wallet: this.walletFromDb(data.wallet, wallet.privateKey),
      reward: Number(data.reward ?? 0)
    };
  }

  // --- 3b. BOOSTS (server-gated by admin_settings.boost_purchases_enabled) ---
  async purchaseBoost(
    walletId: string,
    tierId: string
  ): Promise<{ tier: string; boostPct: number; expiresAt: string }> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_purchase_boost', {
      p_wallet_id: walletId,
      p_tier_id: tierId
    });
    if (error) throw new Error(error.message);
    return {
      tier: String(data?.tier ?? tierId),
      boostPct: Number(data?.boost_pct ?? 0),
      expiresAt: String(data?.expires_at ?? '')
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

  // --- 5. SEND COOPCoin (server-side atomic internal transfer) ---
  // Internal ledger move between registered COOP users. No network fee.
  // The server validates sender/recipient/balance atomically and writes
  // BOTH ledger rows in one transaction. Idempotency nonce prevents
  // duplicate submissions / double spending.
  async executeSend(
    wallet: WalletAccount,
    recipient: string,
    amount: number,
    memo?: string
  ): Promise<{
    wallet: WalletAccount;
    fee: number;
    status: string;
    txHash: string;
    recipientAddress: string;
    amount: number;
  }> {
    const sb = this.assertSupabase();
    const nonce = (globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${wallet.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const { data, error } = await sb.rpc('rpc_execute_send', {
      p_wallet_id: wallet.id,
      p_recipient: recipient,
      p_amount: amount,
      p_client_nonce: nonce,
      p_memo: memo?.trim() || null
    });
    if (error) throw new Error(error.message);
    return {
      wallet: this.walletFromDb(data.wallet, wallet.privateKey),
      fee: Number(data.fee ?? 0),
      status: String(data.status ?? 'Completed'),
      txHash: String(data.tx_hash ?? ''),
      recipientAddress: String(data.recipient_address ?? recipient),
      amount: Number(data.amount ?? amount)
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

  // --- 6b. EXPLORER (public, read-only) ------------------------------------
  // The explorer reads the SAME ledger rows the wallet writes (public.
  // transactions). When the optional ledger-index RPCs are deployed
  // (supabase/migration-v10-explorer.sql) they are used for richer address /
  // aggregate lookups; when they are not deployed yet the explorer still works
  // straight off the read-only ledger, so nothing is ever faked.

  private explorerTxFromDb(row: any): ExplorerTransaction {
    const notes: string | undefined = row.notes || undefined;
    let memo: string | undefined;
    if (notes) {
      const m = notes.match(/\| Memo: ([\s\S]+)$/);
      if (m) memo = m[1].trim();
    }
    return {
      id: row.id,
      txType: row.tx_type,
      amount: Number(row.amount),
      currency: String(row.currency ?? ''),
      pointsAmount: Number(row.points_amount ?? 0),
      direction: row.direction || undefined,
      counterparty: row.counterparty || undefined,
      fee: Number(row.fee ?? 0),
      status: row.status,
      txHash: row.tx_hash,
      notes,
      memo,
      timestamp: new Date(row.created_at).getTime(),
      walletAddress: row.wallet_address || null
    };
  }

  // True when the server answered "function not found" — i.e. the optional
  // migration has not been applied. Any other error is a real failure.
  private isMissingFunction(error: any): boolean {
    const code = String(error?.code || '');
    const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
    return code === 'PGRST202' || /could not find the function|does not exist|schema cache/i.test(msg);
  }

  private applyStatusFilter(query: any, status: ExplorerStatusFilter) {
    if (status === 'completed') return query.or('status.eq.Completed,status.eq.Complete');
    if (status === 'pending') return query.eq('status', 'Pending');
    if (status === 'failed') return query.eq('status', 'Failed');
    return query;
  }

  async explorerRecent(
    opts: { limit?: number; offset?: number; type?: string; status?: ExplorerStatusFilter } = {}
  ): Promise<ExplorerTransaction[]> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const type = opts.type && opts.type !== 'all' ? opts.type : 'all';
    const status: ExplorerStatusFilter = opts.status ?? 'all';
    const sb = this.assertSupabase();

    const { data, error } = await sb.rpc('rpc_explorer_recent', {
      p_limit: limit, p_offset: offset, p_type: type, p_status: status
    });
    if (!error && data) {
      const rows = Array.isArray(data) ? data : (data.rows || []);
      return rows.map((r: any) => this.explorerTxFromDb(r));
    }
    if (error && !this.isMissingFunction(error)) throw new Error(error.message);

    let q = sb
      .from('transactions')
      .select(EXPLORER_TX_COLUMNS)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (type !== 'all') q = q.eq('tx_type', type);
    q = this.applyStatusFilter(q, status);
    const { data: rows, error: readErr } = await q;
    if (readErr) throw new Error(readErr.message);
    return (rows || []).map((r: any) => this.explorerTxFromDb(r));
  }

  async explorerStats(): Promise<ExplorerStats> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_explorer_stats');
    if (!error && data) {
      return {
        total: Number(data.total ?? 0),
        completed: Number(data.completed ?? 0),
        pending: Number(data.pending ?? 0),
        failed: Number(data.failed ?? 0),
        wallets: data.wallets != null ? Number(data.wallets) : null,
        indexed: true,
        firstTimestamp: data.first_created_at ? new Date(data.first_created_at).getTime() : null,
        lastTimestamp: data.last_created_at ? new Date(data.last_created_at).getTime() : null
      };
    }
    if (error && !this.isMissingFunction(error)) throw new Error(error.message);

    // Fallback: exact counts straight from the ledger (read-only).
    const count = async (apply: (q: any) => any): Promise<number> => {
      const res = await apply(sb.from('transactions').select('id', { count: 'exact', head: true }));
      if (res.error) throw new Error(res.error.message);
      return Number(res.count ?? 0);
    };
    const total = await count(q => q);
    const completed = await count(q => q.or('status.eq.Completed,status.eq.Complete'));
    const pending = await count(q => q.eq('status', 'Pending'));
    const failed = await count(q => q.eq('status', 'Failed'));
    return {
      total, completed, pending, failed, wallets: null, indexed: false,
      firstTimestamp: null, lastTimestamp: null
    };
  }

  // Every ledger row written for one transaction hash (a transfer writes two).
  async explorerTxLegs(hash: string): Promise<ExplorerTransaction[]> {
    const clean = sanitizeExplorerQuery(hash);
    if (!clean) return [];
    const sb = this.assertSupabase();

    const { data, error } = await sb.rpc('rpc_explorer_tx', { p_hash: clean });
    if (!error && data) {
      const rows = Array.isArray(data) ? data : (data.rows || []);
      if (rows.length) return rows.map((r: any) => this.explorerTxFromDb(r));
    }
    if (error && !this.isMissingFunction(error)) throw new Error(error.message);

    const exact = await sb
      .from('transactions')
      .select(EXPLORER_TX_COLUMNS)
      .eq('tx_hash', clean)
      .order('created_at', { ascending: true })
      .limit(20);
    if (exact.error) throw new Error(exact.error.message);
    if ((exact.data || []).length) return (exact.data || []).map((r: any) => this.explorerTxFromDb(r));

    const loose = await sb
      .from('transactions')
      .select(EXPLORER_TX_COLUMNS)
      .ilike('tx_hash', clean)
      .order('created_at', { ascending: true })
      .limit(20);
    if (loose.error) throw new Error(loose.error.message);
    return (loose.data || []).map((r: any) => this.explorerTxFromDb(r));
  }

  // Everything the ledger knows about one wallet address.
  async explorerAddressActivity(
    address: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<ExplorerAddressActivity> {
    const clean = sanitizeExplorerQuery(address);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    if (!clean) return { address: clean, rows: [], indexed: false, total: null };
    const sb = this.assertSupabase();

    const { data, error } = await sb.rpc('rpc_explorer_address', {
      p_address: clean, p_limit: limit, p_offset: offset
    });
    if (!error && data) {
      const rows = Array.isArray(data) ? data : (data.rows || []);
      return {
        address: clean,
        rows: rows.map((r: any) => this.explorerTxFromDb(r)),
        indexed: true,
        total: data.total != null ? Number(data.total) : rows.length
      };
    }
    if (error && !this.isMissingFunction(error)) throw new Error(error.message);

    // Fallback without the index: a transfer writes TWO ledger rows sharing one
    // tx_hash, so rows where this address is the counterparty give us the
    // hashes, and the sibling rows of those hashes are the own legs of the
    // address being searched.
    const { data: legs, error: legErr } = await sb
      .from('transactions')
      .select(EXPLORER_TX_COLUMNS)
      .ilike('counterparty', `%${clean}%`)
      .order('created_at', { ascending: false })
      .limit(150);
    if (legErr) throw new Error(legErr.message);

    const hashes = Array.from(new Set((legs || []).map((r: any) => r.tx_hash).filter(Boolean)));
    let siblings: any[] = [];
    if (hashes.length) {
      const { data: sib, error: sibErr } = await sb
        .from('transactions')
        .select(EXPLORER_TX_COLUMNS)
        .in('tx_hash', hashes)
        .limit(500);
      if (sibErr) throw new Error(sibErr.message);
      siblings = sib || [];
    }

    const seen = new Set<string>();
    const merged = [...(legs || []), ...siblings]
      .filter((r: any) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(offset, offset + limit);

    return {
      address: clean,
      rows: merged.map((r: any) => this.explorerTxFromDb(r)),
      indexed: false,
      total: null
    };
  }

  // One search box: transaction hash first, then wallet address.
  async explorerLookup(query: string): Promise<ExplorerLookup> {
    const clean = sanitizeExplorerQuery(query);
    if (!clean) return { kind: 'none' };
    const sb = this.assertSupabase();

    const legs = await this.explorerTxLegs(clean);
    if (legs.length) return { kind: 'tx', hash: legs[0].txHash };
    if (looksLikeAddress(clean)) return { kind: 'address', address: clean };

    const { data, error } = await sb
      .from('transactions')
      .select('tx_hash,counterparty')
      .or(`tx_hash.ilike.%${clean}%,counterparty.ilike.%${clean}%`)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    const row: any = (data || [])[0];
    if (!row) return { kind: 'none' };
    if (looksLikeAddress(row.counterparty || '')) {
      return { kind: 'address', address: sanitizeExplorerQuery(row.counterparty) };
    }
    return { kind: 'tx', hash: String(row.tx_hash) };
  }

  // --- 7. TASKS (server catalog + server-side claim) ---
  // Admin enable/disable is respected: disabled tasks never reach the wallet.
  async getTasks(walletId: string): Promise<TaskItem[]> {
    const sb = this.assertSupabase();
    const { data: catalog, error } = await sb.from('tasks').select('*').eq('enabled', true);
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

  // --- 8. SUPPORT CHAT (user <-> admin, persisted in Supabase) ---
  async openSupportTicket(
    walletId: string, name: string, email: string, subject: string, message: string
  ): Promise<string> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_support_open_ticket', {
      p_wallet_id: walletId, p_name: name, p_email: email,
      p_subject: subject, p_message: message
    });
    if (error || !data) throw new Error(error?.message || 'Could not start the conversation');
    return data.id;
  }

  async sendSupportMessage(ticketId: string, walletId: string, body: string): Promise<void> {
    const sb = this.assertSupabase();
    const { error } = await sb.rpc('rpc_support_send', {
      p_ticket_id: ticketId, p_wallet_id: walletId, p_body: body
    });
    if (error) throw new Error(error.message);
  }

  async pollSupport(ticketId: string, walletId: string): Promise<{
    messages: { id: string; sender: 'user' | 'admin'; body: string; createdAt: number }[];
    adminOnline: boolean;
    adminTyping: boolean;
    status: string;
    adminLastSeenAt: number | null;
    closedBy: 'user' | 'admin' | null;
    closedAt: number | null;
    rating: number | null;
    ratingComment: string | null;
    adminName: string | null;
  }> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_support_poll', {
      p_ticket_id: ticketId, p_wallet_id: walletId
    });
    if (error || !data) throw new Error(error?.message || 'Conversation not found');
    return {
      messages: (data.messages || []).map((m: any) => ({
        id: m.id, sender: m.sender, body: m.body, createdAt: new Date(m.created_at).getTime()
      })),
      adminOnline: Boolean(data.admin_online),
      adminTyping: Boolean(data.admin_typing),
      status: data.ticket?.status || 'open',
      adminLastSeenAt: data.ticket?.admin_last_seen_at
        ? new Date(data.ticket.admin_last_seen_at).getTime() : null,
      closedBy: data.ticket?.closed_by || null,
      closedAt: data.ticket?.closed_at
        ? new Date(data.ticket.closed_at).getTime() : null,
      rating: data.ticket?.rating != null ? Number(data.ticket.rating) : null,
      ratingComment: data.ticket?.rating_comment || null,
      adminName: data.admin_name || data.ticket?.admin_name || null
    };
  }

  async supportTyping(ticketId: string, walletId: string): Promise<void> {
    const sb = this.assertSupabase();
    const { error } = await sb.rpc('rpc_support_typing', {
      p_ticket_id: ticketId, p_wallet_id: walletId, p_admin_key: null
    });
    if (error) throw new Error(error.message);
  }

  // --- Chat history, end/reopen/rate/delete ---
  async mySupportTickets(walletId: string): Promise<{
    id: string; subject: string; status: string; lastMessageAt: number | null;
    unread: number; closedBy: 'user' | 'admin' | null; closedAt: number | null;
    rating: number | null; preview: string; messageCount: number;
  }[]> {
    const sb = this.assertSupabase();
    const { data, error } = await sb.rpc('rpc_support_my_tickets', { p_wallet_id: walletId });
    if (error) throw new Error(error.message);
    return (data || []).map((t: any) => ({
      id: t.id,
      subject: t.subject || 'Support request',
      status: t.status || 'open',
      lastMessageAt: t.last_message_at ? new Date(t.last_message_at).getTime() : null,
      unread: Number(t.unread_for_user ?? 0),
      closedBy: t.closed_by || null,
      closedAt: t.closed_at ? new Date(t.closed_at).getTime() : null,
      rating: t.rating != null ? Number(t.rating) : null,
      preview: t.preview || '',
      messageCount: Number(t.message_count ?? 0)
    }));
  }

  async endSupportChat(ticketId: string, walletId: string, rating?: number | null, comment?: string | null): Promise<void> {
    const sb = this.assertSupabase();
    const { error } = await sb.rpc('rpc_support_end', {
      p_ticket_id: ticketId, p_wallet_id: walletId,
      p_rating: rating ?? null, p_comment: comment || null
    });
    if (error) throw new Error(error.message);
  }

  async rateSupportChat(ticketId: string, walletId: string, rating: number, comment?: string): Promise<void> {
    const sb = this.assertSupabase();
    const { error } = await sb.rpc('rpc_support_rate', {
      p_ticket_id: ticketId, p_wallet_id: walletId,
      p_rating: rating, p_comment: comment || null
    });
    if (error) throw new Error(error.message);
  }

  async reopenSupportChat(ticketId: string, walletId: string): Promise<void> {
    const sb = this.assertSupabase();
    const { error } = await sb.rpc('rpc_support_reopen', {
      p_ticket_id: ticketId, p_wallet_id: walletId
    });
    if (error) throw new Error(error.message);
  }

  async deleteSupportChat(ticketId: string, walletId: string): Promise<void> {
    const sb = this.assertSupabase();
    const { error } = await sb.rpc('rpc_support_delete', {
      p_ticket_id: ticketId, p_wallet_id: walletId
    });
    if (error) throw new Error(error.message);
  }
}

export const dbService = new DatabaseService();
