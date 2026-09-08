export type ScreenName = 
  | 'welcome'
  | 'login'
  | 'signup'
  | 'home'
  | 'mining'
  | 'swap'
  | 'send'
  | 'receive'
  | 'history'
  | 'price_boost'
  | 'tasks'
  | 'menu'
  | 'settings'
  | 'wallet_details'
  | 'help_support'
  | 'about'
  | 'security'
  | 'locked';

export type Currency = 'COOP' | 'Coopoints';
export type SwapDirection = 'points_to_coop' | 'coop_to_points';

export interface WalletAccount {
  id: string;
  address: string;
  privateKey: string;
  coopBalance: number;        // Liquid COOP (only via conversion from Coopoints)
  cooptokenBalance: number;   // Coopoints — internal reward points
  totalSent: number;
  totalReceived: number;
  pinCode: string;
  biometricsEnabled: boolean;
  notificationsEnabled: boolean;
  autoLockMinutes: number;
  createdAt: string;
}

export interface MiningSession {
  id: string;
  walletId: string;
  startTime: number;          // ms epoch (server time)
  endTime: number;            // ms epoch — server-computed daily quota cap
  baseRate: number;           // Coopoints per hour
  boostPct: number;
  status: 'mining' | 'completed';
}

export interface MiningStatus {
  wallet: WalletAccount;
  session: MiningSession | null;
  rate: number;               // Coopoints per hour (base)
  boostPct: number;           // active boost percentage
  hoursMinedToday: number;
  pointsEarnedToday: number;
  dailyHours: number;         // max hours per daily cycle
  dailyLimitPoints: number;   // max Coopoints per daily cycle
  nextResetUtc: number;       // ms epoch
  miningEnabled: boolean;
}

export interface BoostTier {
  id: string;
  name: string;
  priceUsd: number;
  boostPct: number;
  durationDays: number;
}

export interface AppSettings {
  baseMiningRate: number;
  dailyMiningHours: number;
  pointsPerCoop: number;      // Coopoints per 1 COOP (10)
  dailyConversionLimitPoints: number;
  totalCoopRewardPool: number;
  remainingCoopRewardPool: number;
  miningEnabled: boolean;
  conversionEnabled: boolean;
  boostPurchasesEnabled: boolean;
  boostsStackable: boolean;
  swapRateLimitSeconds: number;
  boostTiers: BoostTier[];
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  category: 'all' | 'social' | 'special';
  rewardCooptoken: number;
  actionUrl?: string;
  icon: 'x' | 'telegram' | 'daily' | 'video' | 'invite';
  status: 'pending' | 'completed' | 'claimed';
}

export interface Transaction {
  id: string;
  txType: 'send' | 'receive' | 'swap' | 'mining' | 'boost' | 'task';
  amount: number;             // COOP leg for swaps
  currency: Currency;
  pointsAmount?: number;      // Coopoints leg for swaps
  direction?: SwapDirection;
  counterparty?: string;
  fee?: number;
  status: 'Complete' | 'Pending' | 'Failed';
  txHash: string;
  notes?: string;
  timestamp: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'mining' | 'tx';
  timestamp: number;
  read: boolean;
}
