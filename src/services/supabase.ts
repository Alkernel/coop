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

// Persistent Database Layer (Simulated Server RPC + Cloud Supabase Bridge)
class DatabaseService {
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

    // Local Server-side Simulation Engine
    const wallets = this.getStorage<Record<string, WalletAccount>>('wallets', {});
    const cleanKey = privateKey.trim().toLowerCase();

    if (wallets[cleanKey]) {
      return wallets[cleanKey];
    }

    if (createIfNew) {
      const address = deriveAddressFromKey(privateKey);
      const newWallet: WalletAccount = {
        id: 'w_' + Math.random().toString(36).substring(2, 9),
        address,
        privateKey,
        coopBalance: 1234.56,      // Default matching mockup: $245.68 @ ~$0.199
        cooptokenBalance: 450.00,   // Initial pre-TGE mining balance
        miningPowerLevel: 1,
        currentBoostPct: 15,       // +15% matching mockup
        totalBoostReward: 8.32,
        totalSent: 542.12,
        totalReceived: 1876.45,
        pinCode: '123456',
        biometricsEnabled: true,
        notificationsEnabled: true,
        autoLockMinutes: 5,
        createdAt: new Date().toISOString()
      };
      wallets[cleanKey] = newWallet;
      this.setStorage('wallets', wallets);

      // Seed initial transactions matching mockup Screen 8
      const initialTx: Transaction[] = [
        {
          id: 'tx_1',
          txType: 'receive',
          amount: 50.00,
          currency: 'COOP',
          counterparty: '0x8b3...4e1a',
          status: 'Complete',
          txHash: '0x3a91...f02b',
          timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2
        },
        {
          id: 'tx_2',
          txType: 'send',
          amount: 20.00,
          currency: 'COOP',
          counterparty: '0x4f1...9c8b',
          fee: 0.02,
          status: 'Complete',
          txHash: '0x9c41...892e',
          timestamp: Date.now() - 1000 * 60 * 60 * 24 * 4
        },
        {
          id: 'tx_3',
          txType: 'swap',
          amount: 15.00,
          currency: 'COOP',
          counterparty: 'Coop Swap DEX',
          fee: 0,
          status: 'Complete',
          txHash: '0x88f2...b13d',
          timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5
        },
        {
          id: 'tx_4',
          txType: 'receive',
          amount: 30.00,
          currency: 'COOP',
          counterparty: '0x2c4...77ae',
          status: 'Complete',
          txHash: '0x12b9...55c1',
          timestamp: Date.now() - 1000 * 60 * 60 * 24 * 6
        },
        {
          id: 'tx_5',
          txType: 'send',
          amount: 10.00,
          currency: 'COOP',
          counterparty: '0x19a...ff30',
          fee: 0.02,
          status: 'Complete',
          txHash: '0x71a2...999b',
          timestamp: Date.now() - 1000 * 60 * 60 * 24 * 7
        }
      ];
      this.setStorage(`txs_${newWallet.id}`, initialTx);

      // Create initial active mining session
      this.startMiningSession(newWallet.id, newWallet.currentBoostPct, newWallet.totalBoostReward);

      return newWallet;
    }

    return null;
  }

  // Save modified wallet state
  saveWallet(wallet: WalletAccount): void {
    const wallets = this.getStorage<Record<string, WalletAccount>>('wallets', {});
    const cleanKey = wallet.privateKey.trim().toLowerCase();
    wallets[cleanKey] = wallet;
    this.setStorage('wallets', wallets);
  }

  // --- 2. MINING ENGINE (Server-side validation) ---
  getMiningSession(walletId: string): MiningSession {
    const key = `mining_${walletId}`;
    let session = this.getStorage<MiningSession | null>(key, null);
    if (!session) {
      session = this.startMiningSession(walletId, 15, 8.32);
    }
    return session;
  }

  startMiningSession(walletId: string, boostPct: number = 0, boostRewardBonus: number = 0): MiningSession {
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

  claimMiningSession(wallet: WalletAccount, session: MiningSession): { wallet: WalletAccount; session: MiningSession; reward: number } {
    if (session.status === 'claimed') {
      throw new Error('Reward already claimed');
    }

    const reward = session.totalReward;
    session.status = 'claimed';
    session.claimedAt = Date.now();
    this.setStorage(`mining_${wallet.id}`, session);

    // Credit server-side balance
    wallet.cooptokenBalance = Number((wallet.cooptokenBalance + reward).toFixed(4));
    this.saveWallet(wallet);

    // Record transaction
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

  // --- 3. SWAP (1,000 Cooptoken = 1.000 COOP) ---
  executeSwap(wallet: WalletAccount, cooptokenAmount: number): { wallet: WalletAccount; coopReceived: number } {
    if (cooptokenAmount < 1000) {
      throw new Error('Minimum swap is 1,000 Cooptoken');
    }
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
  executeSend(wallet: WalletAccount, recipient: string, amount: number): { wallet: WalletAccount; fee: number } {
    const fee = 0.02; // Network fee
    const totalDeduct = amount + fee;

    if (amount <= 0) throw new Error('Send amount must be greater than 0');
    if (wallet.coopBalance < totalDeduct) {
      throw new Error(`Insufficient COOP balance for transfer + 0.02 fee`);
    }

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
  purchaseBoost(wallet: WalletAccount, tier: BoostTier): WalletAccount {
    wallet.miningPowerLevel += 1;
    wallet.currentBoostPct += tier.boostPct;
    wallet.totalBoostReward = Number((wallet.totalBoostReward + tier.rewardBonus).toFixed(2));
    this.saveWallet(wallet);

    // Refresh active mining session with the new boost
    this.startMiningSession(wallet.id, wallet.currentBoostPct, wallet.totalBoostReward);

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

  // --- 6. TASKS & REWARDS ---
  getTasks(walletId: string): TaskItem[] {
    const key = `tasks_${walletId}`;
    return this.getStorage<TaskItem[]>(key, DEFAULT_TASKS);
  }

  claimTask(wallet: WalletAccount, taskId: string): { wallet: WalletAccount; tasks: TaskItem[]; reward: number } {
    const tasks = this.getTasks(wallet.id);
    const target = tasks.find(t => t.id === taskId);
    if (!target) throw new Error('Task not found');
    if (target.status === 'claimed') throw new Error('Task already claimed');

    target.status = 'claimed';
    const reward = target.rewardCooptoken;

    // Credit Cooptoken
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

  // --- 7. TRANSACTIONS ---
  getTransactions(walletId: string): Transaction[] {
    return this.getStorage<Transaction[]>(`txs_${walletId}`, []);
  }

  addTransaction(walletId: string, tx: Transaction): void {
    const txs = this.getTransactions(walletId);
    txs.unshift(tx);
    this.setStorage(`txs_${walletId}`, txs);
  }
}

export const dbService = new DatabaseService();
