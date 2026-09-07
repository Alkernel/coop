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

export type Currency = 'COOP' | 'Cooptoken';

export interface WalletAccount {
  id: string;
  address: string;
  privateKey: string;
  coopBalance: number;       // Liquid COOP coin (1,000 Cooptoken = 1 COOP)
  cooptokenBalance: number;  // Pre-TGE mining balance
  miningPowerLevel: number;
  currentBoostPct: number;
  totalBoostReward: number;
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
  startTime: number;
  endTime: number;
  durationHours: number;
  baseReward: number;        // 50 Cooptoken per 12 hours
  boostReward: number;       // Extra reward based on purchased boosts
  totalReward: number;       // base + boost
  status: 'mining' | 'ready_to_claim' | 'claimed';
  claimedAt?: number;
}

export interface BoostTier {
  id: string;
  name: string;
  costUsd: number;
  rewardBonus: number;       // Added to mining session (+100, +300, +700, +1600)
  boostPct: number;          // Added to boost %
  popular?: boolean;
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
  amount: number;
  currency: Currency;
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
