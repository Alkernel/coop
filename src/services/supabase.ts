import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { WalletAccount, MiningSession, Transaction, TaskItem, BoostTier } from '../types';
import { deriveAddressFromKey } from './crypto';

// Supabase credentials (can be supplied in .env or configured in app)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Built-in Default Initial State
const DEFAULT_TASKS: TaskItem[] = [
  {
    id: 'task_x',
    title: 'Follow on X',
    description: 'Join our official X account for updates',
    category: 'social',
    rewardCooptoken: 10,
    actionUrl: 'https://x.com/coopcoin',
    icon: 'x',
    status: 'pending'
  },
  {
    id: 'task_tg',
    title: 'Join Telegram',
    description: 'Join our official community group',
    category: 'social',
    rewardCooptoken: 15,
    actionUrl: 'https://t.me/coopcoin',
    icon: 'telegram',
    status: 'pending'
  },
  {
    id: 'task_daily',
    title: 'Daily Login',
    description: 'Check in daily and earn free mining power',
    category: 'special',
    rewardCooptoken: 5,
    icon: 'daily',
    status: 'claimed'
  },
  {
    id: 'task_video',
    title: 'Watch Video',
    description: 'Watch a short introductory guide to COOP',
    category: 'special',
    rewardCooptoken: 15,
    actionUrl: 'https://youtube.com',
    icon: 'video',
    status: 'pending'
  },
  {
    id: 'task_invite',
    title: 'Invite Friends',
    description: 'Earn rewards for every referral joining COOP',
    category: 'special',
    rewardCooptoken: 50,
    icon: 'invite',
    status: 'pending'
  }
];

export const BOOST_TIERS: BoostTier[] = [
  {
    id: 'boost_1',
    name: 'Starter Boost',
    costUsd: 1.00,
    rewardBonus: 100,
    boostPct: 5
  },
  {
    id: 'boost_2',
    name: 'Pro Miner',
    costUsd: 2.50,
    rewardBonus: 300,
    boostPct: 15,
    popular: true
  },
  {
    id: 'boost_3',
    name: 'Ultra Surge',
    costUsd: 5.00,
    rewardBonus: 700,
    boostPct: 30
  },
  {
    id: 'boost_4',
    name: 'Whale Turbo',
    costUsd: 10.00,
    rewardBonus: 1600,
    boostPct: 75
  }
];

// Persistent Database Layer (Supabase-first with offline localStorage fallback)
class DatabaseService {
  // --- DB row mappers ---
  private walletFromDb(row: any, privateKey?: string): WalletAccount {
    return {
      id: row.id,
      address: row.address,
      privateKey: privateKey || '',
      coopBalance: Number(row.coop_balance),
      cooptokenBalance: Number(row.cooptoken_balance),
      miningPowerLevel: row.mining_power_level ?? 1,
      currentBoostPct: row.current_boost_pct ?? 0,
      totalBoostReward: Number(row.total_boost_reward ?? 0),
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
      durationHours: row.duration_hours ?? 12,
      baseReward: Number(row.base_reward ?? 50),
      boostReward: Number(row.boost_reward ?? 0),
      totalReward: Number(row.total_reward ?? 50),
      status: row.status,
      claimedAt: row.claimed_at ? new Date(row.claimed_at).getTime() : undefined
    };
  }

  private txFromDb(row: any): Transaction {
    return {
      id: row.id,
      txType: row.tx_type,
      amount: Number(row.amount),
      currency: row.currency,
      counterparty: row.counterparty || '',
      fee: Number(row.fee ?? 0),
      status: row.status,
      txHash: row.tx_hash,
      notes: row.notes || undefined,
      timestamp: new Date(row.created_at).getTime()
    };
  }

  private getStorage<T>(key: string, fallback: T): T {
    try {
      const data = localStorage.getItem(`coop_${key}`);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  private setStorage<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`coop_${key}`, JSON.stringify(value));
    } catch (e) {
      console.error('Storage error', e);
    }
  }

  // --- 1. AUTHENTICATE / RESTORE WALLET ---
  async authenticate(privateKey: string, createIfNew: boolean = false): Promise<WalletAccount | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_authenticate_wallet', {
          p_private_key: privateKey,
          p_address: createIfNew ? deriveAddressFromKey(privateKey) : null
        });
        if (!error && data) {
          return {
            id: data.id,
            address: data.address,
            privateKey: privateKey,
            coopBalance: Number(data.coop_balance),
            cooptokenBalance: Number(data.cooptoken_balance),
            miningPowerLevel: data.mining_power_level,
            currentBoostPct: data.current_boost_pct,
            totalBoostReward: Number(data.total_boost_reward),
            totalSent: Number(data.total_sent),
            totalReceived: Number(data.total_received),
            pinCode: data.pin_code || '123456',
            biometricsEnabled: data.biometrics_enabled ?? true,
            notificationsEnabled: data.notifications_enabled ?? true,
            autoLockMinutes: data.auto_lock_minutes ?? 5,
            createdAt: data.created_at
          };
        }
      } catch (e) {
        console.warn('Supabase RPC auth fallback to local store:', e);
      }
    }

    // Offline fallback (only used when Supabase is unreachable)
    const wallets = this.getStorage<Record<string, WalletAccount>>('wallets', {});
    const cleanKey = privateKey.trim().toLowerCase();

    if (wallets[cleanKey]) {
      return wallets[cleanKey];
    }

    if (createIfNew) {
      const address = deriveAddressFromKey(privateKey);
      // New accounts start with ZERO balances — everything is earned via mining & tasks
      const newWallet: WalletAccount = {
        id: 'w_' + Math.random().toString(36).substring(2, 9),
        address,
        privateKey,
        coopBalance: 0,
        cooptokenBalance: 0,
        miningPowerLevel: 1,
        currentBoostPct: 0,
        totalBoostReward: 0,
        totalSent: 0,
        totalReceived: 0,
        pinCode: '123456',
        biometricsEnabled: true,
        notificationsEnabled: true,
        autoLockMinutes: 5,
        createdAt: new Date().toISOString()
      };
      wallets[cleanKey] = newWallet;
      this.setStorage('wallets', wallets);
      return newWallet;
    }

    return null;
  }

  // Save modified wallet state (local cache + best-effort Supabase sync)
  saveWallet(wallet: WalletAccount): void {
    const wallets = this.getStorage<Record<string, WalletAccount>>('wallets', {});
    const cleanKey = wallet.privateKey.trim().toLowerCase();
    wallets[cleanKey] = wallet;
    this.setStorage('wallets', wallets);

    if (supabase && !wallet.id.startsWith('w_')) {
      supabase.from('wallets').update({
        coop_balance: wallet.coopBalance,
        cooptoken_balance: wallet.cooptokenBalance,
        mining_power_level: wallet.miningPowerLevel,
        current_boost_pct: wallet.currentBoostPct,
        total_boost_reward: wallet.totalBoostReward,
        total_sent: wallet.totalSent,
        total_received: wallet.totalReceived,
        pin_code: wallet.pinCode,
        biometrics_enabled: wallet.biometricsEnabled,
        notifications_enabled: wallet.notificationsEnabled,
        auto_lock_minutes: wallet.autoLockMinutes
      }).eq('id', wallet.id).then(() => {});
    }
  }

  // --- 2. MINING ENGINE (Supabase RPC-first, offline fallback) ---
  async getMiningSession(walletId: string): Promise<MiningSession | null> {
    if (supabase && !walletId.startsWith('w_')) {
      try {
        const { data, error } = await supabase
          .from('mining_sessions')
          .select('*')
          .eq('wallet_id', walletId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (!error && data && data.length > 0) {
          return this.sessionFromDb(data[0]);
        }
        if (!error) return null; // real account with no session yet — user must press Start
      } catch (e) {
        console.warn('Supabase getMiningSession fallback:', e);
      }
    }
    return this.getStorage<MiningSession | null>(`mining_${walletId}`, null);
  }

  async startMiningSession(walletId: string, boostPct: number = 0, boostRewardBonus: number = 0): Promise<MiningSession> {
    if (supabase && !walletId.startsWith('w_')) {
      try {
        const { data, error } = await supabase.rpc('rpc_start_mining', { p_wallet_id: walletId });
        if (!error && data) return this.sessionFromDb(data);
      } catch (e) {
        console.warn('Supabase rpc_start_mining fallback:', e);
      }
    }
    const now = Date.now();
    const duration = 12 * 60 * 60 * 1000; // 12 hours
    const baseReward = 50.00; // 50 Cooptoken per 12h
    const boostBonus = (baseReward * (boostPct / 100)) + boostRewardBonus;
    const totalReward = baseReward + boostBonus;

    const session: MiningSession = {
      id: 'mine_' + Math.random().toString(36).substring(2, 9),
      walletId,
      startTime: now,
      endTime: now + duration,
      durationHours: 12,
      baseReward,
      boostReward: boostBonus,
      totalReward,
      status: 'mining'
    };
    this.setStorage(`mining_${walletId}`, session);
    return session;
  }

  async claimMiningSession(wallet: WalletAccount, session: MiningSession): Promise<{ wallet: WalletAccount; session: MiningSession; reward: number }> {
    if (supabase && !wallet.id.startsWith('w_')) {
      try {
        const { data, error } = await supabase.rpc('rpc_claim_mining_reward', {
          p_wallet_id: wallet.id,
          p_session_id: session.id
        });
        if (!error && data) {
          const claimedWallet = this.walletFromDb(data.wallet, wallet.privateKey);
          const claimedSession: MiningSession = { ...session, status: 'claimed', claimedAt: Date.now() };
          this.setStorage(`mining_${wallet.id}`, claimedSession);
          return { wallet: claimedWallet, session: claimedSession, reward: Number(data.reward_claimed ?? session.totalReward) };
        }
        if (error) throw new Error(error.message);
      } catch (e: any) {
        throw new Error(e?.message || 'Failed to claim mining reward');
      }
    }

    // Offline fallback
    if (session.status === 'claimed') {
      throw new Error('Reward already claimed');
    }

    const reward = session.totalReward;
    session.status = 'claimed';
    session.claimedAt = Date.now();
    this.setStorage(`mining_${wallet.id}`, session);

    wallet.cooptokenBalance = Number((wallet.cooptokenBalance + reward).toFixed(4));
    this.saveWallet(wallet);

    this.addTransaction(wallet.id, {
      id: 'tx_' + Date.now(),
      txType: 'mining',
      amount: reward,
      currency: 'Cooptoken',
      counterparty: 'Mining Pool',
      fee: 0,
      status: 'Complete',
      txHash: '0x' + Math.random().toString(16).substring(2, 10) + '...mine',
      notes: '12-hour session payout',
      timestamp: Date.now()
    });

    return { wallet, session, reward };
  }

  // --- 3. SWAP (1,000 Cooptoken = 1.000 COOP — same rate, points to coin) ---
  async executeSwap(wallet: WalletAccount, cooptokenAmount: number): Promise<{ wallet: WalletAccount; coopReceived: number }> {
    if (cooptokenAmount < 1000) {
      throw new Error('Minimum swap is 1,000 Cooptoken');
    }

    if (supabase && !wallet.id.startsWith('w_')) {
      try {
        const { data, error } = await supabase.rpc('rpc_execute_swap', {
          p_wallet_id: wallet.id,
          p_cooptoken_amount: cooptokenAmount
        });
        if (!error && data) {
          const updated = this.walletFromDb(data.wallet, wallet.privateKey);
          const coopReceived = Number((updated.coopBalance - wallet.coopBalance).toFixed(4));
          return { wallet: updated, coopReceived };
        }
        if (error) throw new Error(error.message);
      } catch (e: any) {
        throw new Error(e?.message || 'Swap failed');
      }
    }

    // Offline fallback
    if (wallet.cooptokenBalance < cooptokenAmount) {
      throw new Error('Insufficient Cooptoken balance');
    }

    const coopReceived = Number((cooptokenAmount / 1000).toFixed(4));
    wallet.cooptokenBalance = Number((wallet.cooptokenBalance - cooptokenAmount).toFixed(4));
    wallet.coopBalance = Number((wallet.coopBalance + coopReceived).toFixed(4));
    this.saveWallet(wallet);

    this.addTransaction(wallet.id, {
      id: 'tx_' + Date.now(),
      txType: 'swap',
      amount: coopReceived,
      currency: 'COOP',
      counterparty: 'Coop Swap DEX',
      fee: 0,
      status: 'Complete',
      txHash: '0x' + Math.random().toString(16).substring(2, 10) + '...swap',
      notes: `Swapped ${cooptokenAmount} Cooptoken to ${coopReceived} COOP`,
      timestamp: Date.now()
    });

    return { wallet, coopReceived };
  }

  // --- 4. SEND COOP ---
  async executeSend(wallet: WalletAccount, recipient: string, amount: number): Promise<{ wallet: WalletAccount; fee: number }> {
    const fee = 0.02; // Network fee
    const totalDeduct = amount + fee;

    if (amount <= 0) throw new Error('Send amount must be greater than 0');
    if (wallet.coopBalance < totalDeduct) {
      throw new Error(`Insufficient COOP balance for transfer + 0.02 fee`);
    }

    if (supabase && !wallet.id.startsWith('w_')) {
      try {
        const { data, error } = await supabase.rpc('rpc_execute_send', {
          p_wallet_id: wallet.id,
          p_recipient: recipient,
          p_amount: amount
        });
        if (!error && data) {
          const updated = this.walletFromDb(data.wallet, wallet.privateKey);
          return { wallet: updated, fee };
        }
        if (error) throw new Error(error.message);
      } catch (e: any) {
        throw new Error(e?.message || 'Send failed');
      }
    }

    // Offline fallback
    wallet.coopBalance = Number((wallet.coopBalance - totalDeduct).toFixed(4));
    wallet.totalSent = Number((wallet.totalSent + amount).toFixed(4));
    this.saveWallet(wallet);

    this.addTransaction(wallet.id, {
      id: 'tx_' + Date.now(),
      txType: 'send',
      amount,
      currency: 'COOP',
      counterparty: recipient,
      fee,
      status: 'Complete',
      txHash: '0x' + Math.random().toString(16).substring(2, 10) + '...send',
      notes: `Sent ${amount} COOP to ${recipient}`,
      timestamp: Date.now()
    });

    return { wallet, fee };
  }

  // --- 5. BOOST PURCHASE ---
  async purchaseBoost(wallet: WalletAccount, tier: BoostTier): Promise<WalletAccount> {
    if (supabase && !wallet.id.startsWith('w_')) {
      try {
        const { data, error } = await supabase.rpc('rpc_purchase_boost', {
          p_wallet_id: wallet.id,
          p_tier_name: tier.name,
          p_cost_usd: tier.costUsd,
          p_bonus_reward: tier.rewardBonus,
          p_boost_pct: tier.boostPct
        });
        if (!error && data) {
          const updated = this.walletFromDb(data.wallet, wallet.privateKey);
          // Refresh the active session with the new boost (server-side)
          await this.startMiningSession(wallet.id).catch(() => {});
          return updated;
        }
        if (error) throw new Error(error.message);
      } catch (e: any) {
        throw new Error(e?.message || 'Boost purchase failed');
      }
    }

    // Offline fallback
    wallet.miningPowerLevel += 1;
    wallet.currentBoostPct += tier.boostPct;
    wallet.totalBoostReward = Number((wallet.totalBoostReward + tier.rewardBonus).toFixed(2));
    this.saveWallet(wallet);
    await this.startMiningSession(wallet.id, wallet.currentBoostPct, wallet.totalBoostReward);

    this.addTransaction(wallet.id, {
      id: 'tx_' + Date.now(),
      txType: 'boost',
      amount: tier.rewardBonus,
      currency: 'Cooptoken',
      counterparty: 'COOP Mining Boost',
      fee: 0,
      status: 'Complete',
      txHash: '0x' + Math.random().toString(16).substring(2, 10) + '...boost',
      notes: `Purchased ${tier.name} ($${tier.costUsd})`,
      timestamp: Date.now()
    });

    return wallet;
  }

  // --- 6. TASKS & REWARDS (Supabase tasks table, offline fallback) ---
  async getTasks(walletId: string): Promise<TaskItem[]> {
    if (supabase) {
      try {
        const { data: catalog, error } = await supabase.from('tasks').select('*');
        if (!error && catalog) {
          const { data: userTasks } = await supabase
            .from('user_tasks')
            .select('*')
            .eq('wallet_id', walletId);
          const statusById = new Map<string, string>(
            (userTasks || []).map((ut: any) => [ut.task_id, ut.status])
          );
          return catalog.map((t: any) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            category: t.category === 'all' ? 'special' : t.category,
            rewardCooptoken: Number(t.reward_cooptoken),
            actionUrl: t.action_url || undefined,
            icon: (t.icon === 'twitter' ? 'x' : t.icon) as TaskItem['icon'],
            status: statusById.get(t.id) === 'claimed' ? 'claimed' : 'pending'
          }));
        }
      } catch (e) {
        console.warn('Supabase getTasks fallback:', e);
      }
    }
    return this.getStorage<TaskItem[]>(`tasks_${walletId}`, DEFAULT_TASKS);
  }

  async claimTask(wallet: WalletAccount, taskId: string): Promise<{ wallet: WalletAccount; tasks: TaskItem[]; reward: number }> {
    if (supabase && !wallet.id.startsWith('w_')) {
      try {
        const { data, error } = await supabase.rpc('rpc_claim_task_reward', {
          p_wallet_id: wallet.id,
          p_task_id: taskId
        });
        if (!error && data) {
          const updated = this.walletFromDb(data.wallet, wallet.privateKey);
          const tasks = await this.getTasks(wallet.id);
          return { wallet: updated, tasks, reward: Number(data.task_reward ?? 0) };
        }
        if (error) throw new Error(error.message);
      } catch (e: any) {
        throw new Error(e?.message || 'Task claim failed');
      }
    }

    // Offline fallback
    const tasks = await this.getTasks(wallet.id);
    const target = tasks.find(t => t.id === taskId);
    if (!target) throw new Error('Task not found');
    if (target.status === 'claimed') throw new Error('Task already claimed');

    target.status = 'claimed';
    const reward = target.rewardCooptoken;

    wallet.cooptokenBalance = Number((wallet.cooptokenBalance + reward).toFixed(4));
    this.saveWallet(wallet);
    this.setStorage(`tasks_${wallet.id}`, tasks);

    this.addTransaction(wallet.id, {
      id: 'tx_' + Date.now(),
      txType: 'task',
      amount: reward,
      currency: 'Cooptoken',
      counterparty: target.title,
      fee: 0,
      status: 'Complete',
      txHash: '0x' + Math.random().toString(16).substring(2, 10) + '...task',
      notes: `Completed task: ${target.title}`,
      timestamp: Date.now()
    });

    return { wallet, tasks, reward };
  }

  // --- 7. TRANSACTIONS (Supabase transactions table, offline fallback) ---
  async getTransactions(walletId: string): Promise<Transaction[]> {
    if (supabase && !walletId.startsWith('w_')) {
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('wallet_id', walletId)
          .order('created_at', { ascending: false })
          .limit(100);
        if (!error && data) {
          return data.map((row: any) => this.txFromDb(row));
        }
      } catch (e) {
        console.warn('Supabase getTransactions fallback:', e);
      }
    }
    return this.getStorage<Transaction[]>(`txs_${walletId}`, []);
  }

  addTransaction(walletId: string, tx: Transaction): void {
    // Local cache (offline / local-fallback wallets)
    const txs = this.getStorage<Transaction[]>(`txs_${walletId}`, []);
    txs.unshift(tx);
    this.setStorage(`txs_${walletId}`, txs);

    // Persist to Supabase (server-side RPCs also insert their own rows)
    if (supabase && !walletId.startsWith('w_')) {
      supabase.from('transactions').insert({
        wallet_id: walletId,
        tx_type: tx.txType,
        amount: tx.amount,
        currency: tx.currency,
        counterparty: tx.counterparty,
        fee: tx.fee ?? 0,
        status: tx.status,
        tx_hash: tx.txHash,
        notes: tx.notes ?? null
      }).then(() => {});
    }
  }
}

export const dbService = new DatabaseService();
